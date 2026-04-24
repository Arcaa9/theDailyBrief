import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";


const dynamoClient = new DynamoDBClient({});
const cognitoClient = new CognitoIdentityProviderClient({});


export const handler = async (event) => {
    console.log("Inside Save phone call", event);

    try {
        const { phoneNumber } = JSON.parse(event.body);

        const phoneRegex = /^\+?[1-9]\d{9,14}$/;
        if (!phoneNumber || !phoneRegex.test(phoneNumber)) {
            console.warn("Validation failed: Invalid phone number format.");
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Invalid phone number format." })
            };
        }

        const userId = event.requestContext.authorizer.jwt.claims.sub;

        const updateUser = new UpdateItemCommand({
            TableName: 'newspaper-users',
            Key: {
                userId: { S: userId }
            },
            UpdateExpression: "SET phoneNumber = :phone, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":phone": { S: phoneNumber },
                ":updatedAt": { S: new Date().toISOString() }
            }
        });

        await dynamoClient.send(updateUser);

        const updateCognito = new AdminUpdateUserAttributesCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: userId,
            UserAttributes: [
                { Name: 'phone_number', Value: phoneNumber }
            ]
        });

        await cognitoClient.send(updateCognito);

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: "Phone number saved successfully" })
        };
    } catch (error) {
        console.error("Error while updating the phone number of user", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `Failed to update the phone number. ${error.message}` })
        };
    }
};