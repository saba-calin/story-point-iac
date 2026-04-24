import * as cdk from "aws-cdk-lib/core";
import {Duration, RemovalPolicy} from "aws-cdk-lib/core";
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import {Construct} from "constructs";
import {Constants} from "../constants/constants";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {AccessLogFormat} from "aws-cdk-lib/aws-apigateway";
import * as http from "node:http";

export class ApiGatewayStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    constants: Constants,
    customDomainName: apigwv2.DomainName,
    props?: cdk.StackProps
  ) {

    super(scope, id, props);

    const httpApi = new apigwv2.HttpApi(this, 'StoryPointHttpApi', {
      description: 'HTTP API that handles all request for Story Point app',
      createDefaultStage: false,
      corsPreflight: {
        allowCredentials: true,
        allowOrigins: [
          constants.root_url,
          constants.localhost_url
        ],
        allowMethods: [
          apigwv2.CorsHttpMethod.OPTIONS,
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT
        ],
        maxAge: Duration.seconds(0),
        allowHeaders: [
          'accept',
          'accept-language',
          'content-language',
          'content-type'
        ]
      }
    });

    const logGroup = new LogGroup(this, 'StoryPointApiLogGroup', {
      logGroupName: '/aws/apigateway/story-point',
      retention: RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY
    });
    const logGroupDestination = new apigwv2.LogGroupLogDestination(logGroup);

    const httpApiStage = new apigwv2.HttpStage(this, 'StoryPointAPIStage', {
      httpApi,
      stageName: 'v1',
      autoDeploy: true,
      accessLogSettings: {
        destination: logGroupDestination,
        format: AccessLogFormat.custom(JSON.stringify({
          "requestId": "$context.requestId",
          "extendedRequestId": "$context.extendedRequestId",
          "ip": "$context.identity.sourceIp",
          "requestTime": "$context.requestTime",
          "httpMethod": "$context.httpMethod",
          "routeKey": "$context.routeKey",
          "status": "$context.status",
          "protocol": "$context.protocol",
          "responseLength": "$context.responseLength",
          "error": "$context.error.message",
          "auth-error": "$context.authorizer.error",
          "integrationStatus": "$context.integrationStatus",
          "integrationError": "$context.integrationErrorMessage",
          "integrationLatency": "$context.integrationLatency"
        }))
      }
    });

    new apigwv2.ApiMapping(this, 'HttpApiMapping', {
      api: httpApi,
      domainName: customDomainName,
      stage: httpApiStage
    });

    const lambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('SignUpLambdaIntegration', lambda.Function.fromFunctionName(this, 'SignUpLambda', 'sign-up_lambda'));
    httpApi.addRoutes({
      path: '/auth/sign-up',
      methods: [apigwv2.HttpMethod.POST],
      integration: lambdaIntegration
    });

    const logInLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('LogInLambdaIntegration', lambda.Function.fromFunctionName(this, 'LogInLambda', 'log-in_lambda'));
    httpApi.addRoutes({
      path: '/auth/log-in',
      methods: [apigwv2.HttpMethod.POST],
      integration: logInLambdaIntegration,
    });

    const authorizerLambda = lambda.Function.fromFunctionName(this, 'AuthorizerLambda', 'authorizer_lambda');
    const authorizer = new apigwv2Authorizers.HttpLambdaAuthorizer('LambdaAuthorizer', authorizerLambda, {
      authorizerName: 'StoryPointLambdaAuthorizer',
      resultsCacheTtl: Duration.seconds(0),
      identitySource: ['$request.header.cookie']
    });

    const logOutLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('LogOutLambdaIntegration', lambda.Function.fromFunctionName(this, 'LogOutLambda', 'log-out_lambda'));
    httpApi.addRoutes({
      path: '/auth/log-out',
      methods: [apigwv2.HttpMethod.POST],
      integration: logOutLambdaIntegration
    });

    const refreshLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('RefreshLambdaIntegration', lambda.Function.fromFunctionName(this, 'RefreshLambda', 'refresh_lambda'));
    httpApi.addRoutes({
      path: '/auth/refresh',
      methods: [apigwv2.HttpMethod.POST],
      integration: refreshLambdaIntegration
    });

    const testLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('TestLambdaIntegration', lambda.Function.fromFunctionName(this, 'TestLambda', 'test_lambda'));
    httpApi.addRoutes({
      path: '/test',
      methods: [apigwv2.HttpMethod.GET],
      integration: testLambdaIntegration,
      authorizer: authorizer
    });

    const changePasswordLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('ChangePasswordLambdaIntegration', lambda.Function.fromFunctionName(this, 'ChangePasswordLambda', 'change-password_lambda'));
    httpApi.addRoutes({
      path: '/auth/change-password',
      methods: [apigwv2.HttpMethod.POST],
      integration: changePasswordLambdaIntegration,
      authorizer: authorizer
    });

    const createRoomLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('CreateRoomLambdaIntegration', lambda.Function.fromFunctionName(this, 'CreateRoomLambda', 'create-room_lambda'));
    httpApi.addRoutes({
      path: '/create-room',
      methods: [apigwv2.HttpMethod.POST],
      integration: createRoomLambdaIntegration,
      authorizer: authorizer
    });

    const authMeLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('AuthMeLambdaIntegration', lambda.Function.fromFunctionName(this, 'AuthMeLambda', 'auth-me_lambda'));
    httpApi.addRoutes({
      path: '/auth/me',
      methods: [apigwv2.HttpMethod.GET],
      integration: authMeLambdaIntegration,
      authorizer: authorizer
    });

    const getRoomLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('GetRoomLambdaIntegration', lambda.Function.fromFunctionName(this, 'GetRoomLambda', 'get-room_lambda'));
    httpApi.addRoutes({
      path: '/rooms',
      methods: [apigwv2.HttpMethod.GET],
      integration: getRoomLambdaIntegration,
      authorizer: authorizer
    });

    const getUserLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('GetUserLambdaIntegration', lambda.Function.fromFunctionName(this, 'GetUserLambda', 'get-user_lambda'));
    httpApi.addRoutes({
      path: '/users',
      methods: [apigwv2.HttpMethod.GET],
      integration: getUserLambdaIntegration,
      authorizer: authorizer
    });

    const banUserLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('BanUserLambdaIntegration', lambda.Function.fromFunctionName(this, 'BanUserLambda', 'ban-user_lambda'));
    httpApi.addRoutes({
      path: '/users/ban',
      methods: [apigwv2.HttpMethod.PUT],
      integration: banUserLambdaIntegration,
      authorizer: authorizer
    });

    const aiEstimateLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('AiEstimateLambdaIntegration', lambda.Function.fromFunctionName(this, 'AiEstimateLambda', 'ai-estimate_lambda'));
    httpApi.addRoutes({
      path: '/story/ai-estimate',
      methods: [apigwv2.HttpMethod.POST],
      integration: aiEstimateLambdaIntegration,
      authorizer: authorizer
    });

    const getStoryLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('GetStoryLambdaIntegration', lambda.Function.fromFunctionName(this, 'GetStoryLambda', 'get-story_lambda'));
    httpApi.addRoutes({
      path: '/rooms/{roomId}/stories',
      methods: [apigwv2.HttpMethod.GET],
      integration: getStoryLambdaIntegration,
      authorizer: authorizer
    });

    const getVoteLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('GetVoteLambdaIntegration', lambda.Function.fromFunctionName(this, 'GetVoteLambda', 'get-vote_lambda'));
    httpApi.addRoutes({
      path: '/rooms/{roomId}/stories/{storyId}/votes',
      methods: [apigwv2.HttpMethod.GET],
      integration: getVoteLambdaIntegration,
      authorizer: authorizer
    });

    const getAvatarUploadUrlLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('GetAvatarUploadUrlLambdaIntegration', lambda.Function.fromFunctionName(this, 'GetAvatarUploadUrlLambda', 'get-avatar-upload-url_lambda'));
    httpApi.addRoutes({
      path: '/users/me/avatar/upload-url',
      methods: [apigwv2.HttpMethod.GET],
      integration: getAvatarUploadUrlLambdaIntegration,
      authorizer: authorizer
    });

    const saveJiraTokenLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('SaveJiraTokenLambdaIntegration', lambda.Function.fromFunctionName(this, 'SaveJiraTokenLambda', 'save-jira-token_lambda'));
    httpApi.addRoutes({
      path: '/users/jira-token',
      methods: [apigwv2.HttpMethod.PUT],
      integration: saveJiraTokenLambdaIntegration,
      authorizer: authorizer
    });

    const getJiraProjectsLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('GetJiraProjectsLambdaIntegration', lambda.Function.fromFunctionName(this, 'GetJiraProjectsLambda', 'get-jira-projects_lambda'));
    httpApi.addRoutes({
      path: '/jira/projects',
      methods: [apigwv2.HttpMethod.GET],
      integration: getJiraProjectsLambdaIntegration,
      authorizer: authorizer
    });

    const getJiraStoriesLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('GetJiraStoriesLambdaIntegration', lambda.Function.fromFunctionName(this, 'GetJiraStoriesLambda', 'get-jira-stories_lambda'));
    httpApi.addRoutes({
      path: '/jira/stories',
      methods: [apigwv2.HttpMethod.GET],
      integration: getJiraStoriesLambdaIntegration,
      authorizer: authorizer
    });

    const cfnAuthorizer = httpApi.node.findChild('LambdaAuthorizer').node.defaultChild as apigwv2.CfnAuthorizer;
    cfnAuthorizer.authorizerPayloadFormatVersion = '2.0';
    cfnAuthorizer.enableSimpleResponses = false;
  }
}
