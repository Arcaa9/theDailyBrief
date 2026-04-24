import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const dynamoClient = new DynamoDBClient({});

export const handler = async (event) => {
    for (const record of event.Records) {
        try {
            const body = JSON.parse(record.body);
            const { emailId, userId, email, phone, presignedURL } = body;

            await dynamoClient.send(new PutItemCommand({
                TableName: "newspaper-emailLog",
                Item: {
                    emailId: { S: emailId },
                    userId: { S: userId },
                    email: { S: email },
                    phoneNumber: { S: phone || '' },
                    presignedUrl: { S: presignedURL || '' },
                    emailStatus: { S: "Failed" },
                    createdAt: { S: new Date().toISOString() }
                }
            }));

            console.log("Marked as failed", emailId);
        } catch (error) {
            console.log("Error in DLQ handler", error);
            throw error;
        }
    }
};