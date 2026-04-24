import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";

const client = new DynamoDBClient({});
const cognitoClient = new CognitoIdentityProviderClient({});

export const handler = async (event) => {
    console.log("Inside Post confirmation call", event);
    try {
        const { sub, email, name } = event.request.userAttributes;
        const createdAt = new Date().toISOString();

        await client.send(new PutItemCommand({
            TableName: 'newspaper-users',
            ConditionExpression: "attribute_not_exists(userId)",
            Item: {
                userId: { S: sub },
                name: { S: name },
                email: { S: email },
                createdAt: { S: createdAt }
            }
        }));

        await cognitoClient.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: event.userPoolId,
            Username: event.userName,
            UserAttributes: [
                { Name: "custom:createdAt", Value: createdAt }
            ]
        }));

        console.log("User created successfully");
        return event;
    } catch (error) {
        console.log("Failed to create user", error);
        throw error;
    }
};