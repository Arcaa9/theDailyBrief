import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import PDFDocument from "pdfkit";
import fetch from "node-fetch";
import { randomUUID } from "crypto";

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const BUCKET = "process.env.BUCKET_NAME";
const NEWS_API_KEY = "process.env.NEWS_API_KEY";

const stripHtml = (str) => str ? str.replace(/<[^>]*>/g, '').trim() : '';

export const handler = async (event) => {
    console.log("Inside Email me Call", event);

    const today = new Date().toISOString().split('T')[0];
    const fileName = `news/${today}.pdf`;
    const getFile = new GetObjectCommand({ Bucket: BUCKET, Key: fileName });
    let url = '';

    try {
        await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: fileName }));
        url = await getSignedUrl(s3Client, getFile, { expiresIn: 172800 });
        console.log("PDF already exists in S3, using cached version");

    } catch (error) {
        if (error.name === "NotFound") {
            console.log("PDF not found, generating...");

            const news = await fetchNews(NEWS_API_KEY);
            const newsPdf = await generatePDF(news);

            await s3Client.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: fileName,
                Body: newsPdf,
                ContentType: "application/pdf"
            }));

            url = await getSignedUrl(s3Client, getFile, { expiresIn: 172800 });
            console.log("PDF generated and uploaded to S3");

        } else {
            console.error("S3 error", error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: `S3 error: ${error.message}` })
            };
        }
    }

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const email = event.requestContext.authorizer.jwt.claims.email;
    const phone = event.requestContext.authorizer.jwt.claims.phone_number;

    try {
        await dynamoClient.send(new PutItemCommand({
            TableName: "newspaper-emailLog",
            Item: {
                emailId: { S: randomUUID() },
                userId: { S: userId },
                email: { S: email },
                phoneNumber: { S: phone },
                presignedUrl: { S: url },
                emailStatus: { S: "Pending" },
                createdAt: { S: new Date().toISOString() }
            }
        }));

        console.log("Email log entry created successfully");

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Email queued successfully" })
        };

    } catch (error) {
        console.error("Failed to create email log entry", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `Failed to queue email: ${error.message}` })
        };
    }
};

async function fetchNews(apiKey) {
    const news = [];
    const categories = ["world", "politics", "sports", "technology"];

    for (const category of categories) {
        try {
            const url = `https://newsdata.io/api/1/news?apikey=${apiKey}&country=in&category=${category}&size=5&language=en`;
            const response = await fetch(url);
            const data = await response.json();
            news.push({ category, articles: data.results || [] });
        } catch (error) {
            console.error(`Failed to fetch ${category} news`, error);
            news.push({ category, articles: [] });
        }
    }

    return news;
}

async function generatePDF(news) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const categoryConfig = {
            world: { title: 'International News', color: '#1A73E8', light: '#E8F0FE' },
            politics: { title: 'National News', color: '#E53935', light: '#FFEBEE' },
            sports: { title: 'Sports', color: '#2E7D32', light: '#E8F5E9' },
            technology: { title: 'Technology', color: '#6A1B9A', light: '#F3E5F5' }
        };

        news.forEach((section, index) => {
            if (index > 0) doc.addPage();

            const config = categoryConfig[section.category] || {
                title: section.category,
                color: '#333333',
                light: '#F5F5F5'
            };

            // colored header banner
            doc.rect(0, 0, 595, 75).fill(config.color);

            // date top right
            doc.fontSize(9)
                .fillColor('white')
                .text(new Date().toDateString(), 50, 12, { width: 495, align: 'right' });

            // category title
            doc.fontSize(26)
                .font('Helvetica-Bold')
                .fillColor('white')
                .text(config.title, 50, 20, { width: 495, align: 'center' });

            // reset position below banner
            doc.y = 95;
            doc.x = 50;

            if (!section.articles || section.articles.length === 0) {
                doc.fontSize(12)
                    .font('Helvetica')
                    .fillColor('#333333')
                    .text('No articles available.');
            } else {
                section.articles.forEach((article, i) => {
                    const title = stripHtml(article.title) || 'No title';
                    const description = (stripHtml(article.description) || 'No description available.')
                        .replace('[...]', '')
                        .trim();

                    // article number + title
                    doc.fontSize(13)
                        .font('Helvetica-Bold')
                        .fillColor(config.color)
                        .text(`${i + 1}.  `, 50, doc.y, { continued: true })
                        .fillColor('#1A1A1A')
                        .text(title, { width: 460 });

                    doc.moveDown(0.4);

                    // description
                    doc.fontSize(10)
                        .font('Helvetica')
                        .fillColor('#444444')
                        .text(description, 50, doc.y, { width: 495, align: 'justify' });

                    doc.moveDown(0.3);

                    // source + date
                    doc.fontSize(8)
                        .fillColor(config.color)
                        .text(
                            `Source: ${article.source_id || 'Unknown'}   |   ${article.pubDate || ''}`,
                            50, doc.y, { width: 495 }
                        );

                    doc.moveDown(0.8);

                    // thin divider between articles
                    if (i < section.articles.length - 1) {
                        doc.moveTo(50, doc.y)
                            .lineTo(545, doc.y)
                            .lineWidth(0.5)
                            .strokeColor('#CCCCCC')
                            .stroke();
                        doc.moveDown(0.8);
                    }
                });
            }
        });

        // single footer at the very end
        doc.moveDown(2);
        doc.fontSize(8)
            .fillColor('#999999')
            .text(
                `Generated by Newspaper App · ${new Date().toDateString()} · Valid for 48 hours`,
                50, doc.y, { width: 495, align: 'center' }
            );

        doc.end();
    });
}