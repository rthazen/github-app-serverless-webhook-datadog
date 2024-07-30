// import our dependencies
const { Octokit } = require("@octokit/core");
const { createAppAuth } = require("@octokit/auth-app");
const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const dynamoDbClient = new DynamoDBClient({
  region: "us-east-1",
});

const snsClient = new SNSClient({
  region: "us-east-1",
  apiVersion: "2012-11-05",
});

module.exports.webhook = async (event) => {
  await snsClient.send(
    new PublishCommand({
      Message: event.body,
      TopicArn: process.env.SNS_TOPIC_ARN,
    })
  );
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
    },
  };
};

module.exports.processor = async (event) => {
  // parse the incoming event
  for (let e of event.Records) {
    // Parse the SQS message
    const { Message } = JSON.parse(e.body);
    // And parse the underlying SNS message
    const body = JSON.parse(Message);
    // let's make sure that we're dealing with a 'open an issue' event
    if (body.action !== "opened") {
      continue;
    }
    // retrieve auth PEM and app installation details to generate a token
    const data = await dynamoDbClient.send(
      new ScanCommand({
        TableName: "serverless_dash_workshop",
      })
    );
    const firstItem = unmarshall(data.Items[0]);

    const installationOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: firstItem.app_id,
        privateKey: firstItem.pem,
        installationId: body.installation.id,
      },
    });
    // post the comment ! 🔥
    try {
      await installationOctokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner: body.issue.user.login,
          repo: body.repository.name,
          issue_number: body.issue.number,
          body: "hello from an asynchronous Lambda-powered Github App 🔥",
        }
      );
    } catch (e) {
      console.error(e);
    }
  }

  return {
    statusCode: 200,
  };
};
