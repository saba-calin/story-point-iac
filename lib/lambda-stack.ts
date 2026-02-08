import * as cdk from "aws-cdk-lib/core";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import {Construct} from "constructs";
import {Constants} from "../constants/constants";

export class LambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, constants: Constants, props?: cdk.StackProps) {

    super(scope, id, props);

    const signUpLambda = new lambda.Function(this, 'SignUpLambda', {
      functionName: 'sign-up_lambda',
      description: 'Lambda function that handles the sign-up of the users',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/sign-up/dist/sign-up')
    });
  }
}
