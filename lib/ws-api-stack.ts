import * as cdk from "aws-cdk-lib/core";
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import {Construct} from "constructs";
import {Constants} from "../constants/constants";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2Authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {RemovalPolicy} from "aws-cdk-lib/core";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

export class WsApiStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    constants: Constants,
    customDomainName: apigwv2.DomainName,
    props?: cdk.StackProps
  ) {

    super(scope, id, props);

    // Create CloudWatch Logs role for API Gateway (only needed once per account/region)
    const apiGatewayCloudWatchRole = new iam.Role(this, 'ApiGatewayCloudWatchRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs')
      ]
    });

    // Set the CloudWatch role for API Gateway account settings
    const apiGatewayAccount = new apigateway.CfnAccount(this, 'ApiGatewayAccount', {
      cloudWatchRoleArn: apiGatewayCloudWatchRole.roleArn
    });

    const wsApi = new apigwv2.WebSocketApi(this, 'StoryPointWebSocketApi', {
      description: 'WebSocket API that handles all WebSocket connections for the Story Point app',
      routeSelectionExpression: '$request.body.action'
    });

    const logGroup = new LogGroup(this, 'StoryPointWsApiLogGroup', {
      logGroupName: '/aws/apigateway/ws-story-point',
      retention: RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const wsApiStage = new apigwv2.WebSocketStage(this, 'WsAPIStage', {
      webSocketApi: wsApi,
      stageName: 'v1',
      autoDeploy: true
    });

    wsApiStage.node.addDependency(apiGatewayAccount);

    new apigwv2.ApiMapping(this, 'HttpApiMapping', {
      api: wsApi,
      domainName: customDomainName,
      stage: wsApiStage
    });

    const cfnStage = wsApiStage.node.defaultChild as apigwv2.CfnStage;
    cfnStage.accessLogSettings = {
      destinationArn: logGroup.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        extendedRequestId: "$context.extendedRequestId",
        connectionId: "$context.connectionId",
        routeKey: "$context.routeKey",
        action: "$context.requestBody.action",
        eventType: "$context.eventType",
        sourceIp: "$context.identity.sourceIp",
        requestTime: "$context.requestTime",
        status: "$context.status",
        responseLength: "$context.responseLength",
        integrationStatus: "$context.integrationStatus",
        integrationLatency: "$context.integrationLatency",
        integrationError: "$context.integrationErrorMessage",
        errorMessage: "$context.error.message"
      })
    };
    cfnStage.defaultRouteSettings = {
      loggingLevel: 'INFO',
      dataTraceEnabled: true
    };

    const authorizerLambda = lambda.Function.fromFunctionName(this, 'WsAuthorizerLambda', 'authorizer_lambda');
    const authorizer = new apigwv2Authorizers.WebSocketLambdaAuthorizer('WsAuthorizer', authorizerLambda, {
      identitySource: ['route.request.header.cookie']
    });

    const connectLambdaIntegration = new apigwv2Integrations.WebSocketLambdaIntegration('WsConnectLambdaIntegration', lambda.Function.fromFunctionName(this, 'WsConnectLambda', 'ws-connect_lambda'));
    wsApi.addRoute("$connect", {
      integration: connectLambdaIntegration,
      authorizer: authorizer
    });

    const wsTestLambdaIntegration = new apigwv2Integrations.WebSocketLambdaIntegration('WsTestLambdaIntegration', lambda.Function.fromFunctionName(this, 'WsTestLambda', 'ws-test_lambda'));
    wsApi.addRoute("test", {
      integration: wsTestLambdaIntegration
    });

    // const testLambdaIntegration = new apigwv2Integrations.WebSocketLambdaIntegration('TestLambdaIntegration', lambda.Function.fromFunctionName(this, 'TestLambda', 'test_lambda'));
    // wsApi.addRoute("$default", {
    //   integration: testLambdaIntegration
    // });
  }
}
