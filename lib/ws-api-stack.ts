import * as cdk from "aws-cdk-lib/core";
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import {Construct} from "constructs";
import {Constants} from "../constants/constants";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2Authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export class WsApiStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    constants: Constants,
    props?: cdk.StackProps
  ) {

    super(scope, id, props);

    const wsApi = new apigwv2.WebSocketApi(this, 'StoryPointWebSocketApi', {
      description: 'WebSocket API that handles all WebSocket connections for the Story Point app',
      routeSelectionExpression: 'request.body.action'
    });

    const authorizerLambda = lambda.Function.fromFunctionName(this, 'WsAuthorizerLambda', 'authorizer_lambda');
    const authorizer = new apigwv2Authorizers.WebSocketLambdaAuthorizer('WsAuthorizer', authorizerLambda, {
      identitySource: ['route.request.header.cookie']
    });

    const connectLambdaIntegration = new apigwv2Integrations.WebSocketLambdaIntegration('WsConnectLambdaIntegration', lambda.Function.fromFunctionName(this, 'WsConnectLambda', 'ws-connect_lambda'));
    wsApi.addRoute("$connect", {
      integration: connectLambdaIntegration,
      authorizer: authorizer
    });
  }
}
