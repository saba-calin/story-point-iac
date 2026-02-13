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
          apigwv2.CorsHttpMethod.POST
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
      path: '/sign-up',
      methods: [apigwv2.HttpMethod.POST],
      integration: lambdaIntegration
    });

    const logInLambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration('LogInLambdaIntegration', lambda.Function.fromFunctionName(this, 'LogInLambda', 'log-in_lambda'));
    httpApi.addRoutes({
      path: '/log-in',
      methods: [apigwv2.HttpMethod.POST],
      integration: logInLambdaIntegration,
    });

    const authorizerLambda = lambda.Function.fromFunctionName(this, 'AuthorizerLambda', 'authorizer_lambda');
    const authorizer = new apigwv2Authorizers.HttpLambdaAuthorizer('LambdaAuthorizer', authorizerLambda, {
      authorizerName: 'StoryPointLambdaAuthorizer',
      responseTypes: [apigwv2Authorizers.HttpLambdaResponseType.SIMPLE],
      resultsCacheTtl: Duration.seconds(0),
      identitySource: []
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
      path: '/change-password',
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
  }
}
