import * as cdk from "aws-cdk-lib/core";
import {Duration, RemovalPolicy} from "aws-cdk-lib/core";
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
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

    const logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: 'aws/apigateway/story-point',
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
  }
}
