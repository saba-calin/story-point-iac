import * as cdk from "aws-cdk-lib/core";
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import {Construct} from "constructs";
import {Constants} from "../constants/constants";

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
  }
}
