import { DynamoDBClient, UpdateItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const dynamoClient = new DynamoDBClient({});
const sesClient = new SESClient({});
const snsClient = new SNSClient({});

export const handler = async (event) => {
    // DynamoDb Stream passes the record triggered.

    for (const record of event.Records) {
        let emailId, email, phone, presignedURL, status, userId;
        try {

            if (record.eventSource == 'aws:dynamodb') {
                if (record.eventName !== "INSERT") continue;

                let newImage = record.dynamodb.NewImage;
                emailId = newImage.emailId.S;
                status = newImage.emailStatus.S;
                email = newImage.email.S;
                phone = newImage.phoneNumber.S;
                presignedURL = newImage.presignedUrl.S;

            } else if (record.eventSource == 'aws:sqs') {

                let body = JSON.parse(record.body);
                emailId = body.emailId;
                userId = body.userId;
                status = body.emailStatus;
                email = body.email;
                phone = body.phone;
                presignedURL = body.presignedUrl;
            }

            if (status === 'Pending') {

                // Send email
                const emailMessage = {
                    Subject: { Data: "Your Daily Brief is Ready!" },
                    Body: {
                        Html: {
                            Data: `
                                <h2>Good Morning!</h2>
                                <br/>
                                <p>Your daily news digest is ready and waiting for you.</p>
                                <a href="${presignedURL}" style="display:inline-block; padding:12px 24px; background:#2d6a4f; color:white; text-decoration:none; border-radius:6px; font-size:16px; font-weight:bold;">📰 Read Today's Brief</a>
                                <br/>
                                <br/>
                                <br/>
                                <small style="color:#999; font-size:11px;">Link valid for 48 hours.</small>
                            `
                        }
                    }
                }
                await sesClient.send(new SendEmailCommand({
                    Source: process.env.SES_SENDER_EMAIL,
                    Destination: {
                        ToAddresses: [email]
                    },
                    Message: emailMessage
                }));

                console.log("Successfully sent the email.",)

                // Send message
                if (phone) {
                    const smsMessage = `Good Morning! Your daily Brief is ready. Read here: ${presignedURL} (Link valid for 48 hours)`;
                    await snsClient.send(new PublishCommand({
                        PhoneNumber: phone,
                        Message: smsMessage
                    }));
                }

                console.log("Successfully sent the notification.",)

                if (record.eventSource == 'aws:dynamodb') {
                    const updateLog = new UpdateItemCommand({
                        TableName: "newspaper-emailLog",
                        Key: {
                            emailId: { S: emailId }
                        },
                        UpdateExpression: "SET emailStatus = :status, updatedAt = :updatedAt",
                        ExpressionAttributeValues: {
                            ":status": { S: 'Sent' },
                            ":updatedAt": { S: new Date().toISOString() }
                        }
                    });

                    await dynamoClient.send(updateLog);
                } else if (record.eventSource == 'aws:sqs') {
                    await dynamoClient.send(new PutItemCommand({
                        TableName: "newspaper-emailLog",
                        Item: {
                            emailId: { S: emailId },
                            userId: { S: userId },
                            email: { S: email },
                            ...(phone && { phoneNumber: { S: phone } }),
                            presignedUrl: { S: presignedURL },
                            emailStatus: { S: "Sent" },
                            createdAt: { S: new Date().toISOString() }
                        }
                    }));
                }
            }
        } catch (error) {
            console.log("error while sending email or mobile notifications");
            throw error;
        }
    }
};