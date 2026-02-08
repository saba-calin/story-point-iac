import * as cdk from "aws-cdk-lib/core";
import {RemovalPolicy} from "aws-cdk-lib/core";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import {Construct} from "constructs";
import {Constants} from "../constants/constants";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";

export class LambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, constants: Constants, props?: cdk.StackProps) {

    super(scope, id, props);

    this.deploySignUpLambda(constants);
  }

  private deploySignUpLambda(constants: Constants) {
    const logGroup = this.createLambdaFunctionLogGroup('sign-up');

    const signUpLambda = new lambda.Function(this, 'SignUpLambda', {
      functionName: 'sign-up_lambda',
      description: 'Lambda function that handles the sign-up of the users',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/sign-up/dist/sign-up'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
    });

    const table = dynamodb.TableV2.fromTableName(this, 'ImportedUsersTable', 'Users');
    table.grantReadWriteData(signUpLambda);
  }

  private createLambdaFunctionLogGroup(lambdaName: string) {
    return new LogGroup(this, `${lambdaName}_lambda`, {
      logGroupName: `/aws/lambda/${lambdaName}`,
      retention: RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY
    });
  }
}
