import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({});

export const handler = async (event) => {
    try {
        const result = await client.send(new QueryCommand({
            TableName: "newspaper-emailLog",
            IndexName: "emailStatus-index",
            KeyConditionExpression: "emailStatus = :status",
            ExpressionAttributeValues: {
                ":status": { S: "Failed" }
            }
        }));

        console.log("Successfuly fetched the failed records");

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: result.Items })
        };

    } catch (error) {
        console.error("Error while fetching failed records", error);
        throw error;
    }
};