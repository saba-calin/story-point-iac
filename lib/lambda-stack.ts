import * as cdk from "aws-cdk-lib/core";
import {RemovalPolicy} from "aws-cdk-lib/core";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import {Construct} from "constructs";
import {Constants} from "../constants/constants";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {ISecret} from "aws-cdk-lib/aws-secretsmanager";

export class LambdaStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    constants: Constants,
    usersTable: dynamodb.TableV2,
    userEmailsTable: dynamodb.TableV2,
    props?: cdk.StackProps
  ) {

    super(scope, id, props);

    const jwtSecretArn = ssm.StringParameter.valueForStringParameter(this, constants.jwt_secret_arn_parameter);
    const jwtSecret = secretsmanager.Secret.fromSecretCompleteArn(this, 'JwtSecret', jwtSecretArn);

    this.deployTestLambda(constants);
    this.deployChangePasswordLambda(constants, usersTable);
    this.deployAuthorizerLambda(constants, jwtSecretArn, jwtSecret);
    this.deployLogInLambda(constants, usersTable, jwtSecretArn, jwtSecret);
    this.deploySignUpLambda(constants, usersTable, userEmailsTable, jwtSecretArn, jwtSecret);
  }

  private deployTestLambda(constants: Constants) {
    const logGroup = this.createLambdaFunctionLogGroup('test');

    new lambda.Function(this, 'TestLambda', {
      functionName: 'test_lambda',
      description: 'Lambda function to test a protected endpoint',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/test/dist/test'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup
    });
  }

  private deployChangePasswordLambda(
    constants: Constants,
    usersTable: dynamodb.TableV2
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('change-password');

    const changePasswordLambda = new lambda.Function(this, 'ChangePasswordLambda', {
      functionName: 'change-password_lambda',
      description: 'Lambda function that handles the password change of a user',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/change-password/dist/change-password'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        USERS_TABLE: usersTable.tableName,
        PASSWORD_SALT_ROUNDS: String(constants.password_salt_rounds)
      }
    });

    usersTable.grantReadWriteData(changePasswordLambda);
  }

  private deployAuthorizerLambda(
    constants: Constants,
    jwtSecretArn: string,
    jwtSecret: ISecret
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('authorizer');

    const authorizerLambda = new lambda.Function(this, 'AuthorizerLambda', {
      functionName: 'authorizer_lambda',
      description: 'Lambda function that handles the authorization of the protected endpoints',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/authorizer/dist/authorizer'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        JWT_SECRET_ARN: jwtSecretArn,
      }
    });

    jwtSecret.grantRead(authorizerLambda);
  }

  private deployLogInLambda(
    constants: Constants,
    usersTable: dynamodb.TableV2,
    jwtSecretArn: string,
    jwtSecret: ISecret
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('log-in');

    const logInLambda = new lambda.Function(this, 'LogInLambda', {
      functionName: 'log-in_lambda',
      description: 'Lambda function that handles the log-in of the users',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/log-in/dist/log-in'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        USERS_TABLE: usersTable.tableName,
        JWT_SECRET_ARN: jwtSecretArn,
        JWT_EXPIRY_DAYS: String(constants.jwt_expiry_days)
      }
    });

    jwtSecret.grantRead(logInLambda);
    usersTable.grantReadData(logInLambda);
  }

  private deploySignUpLambda(
    constants: Constants,
    usersTable: dynamodb.TableV2,
    userEmailsTable: dynamodb.TableV2,
    jwtSecretArn: string,
    jwtSecret: ISecret
  ) {
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
      environment: {
        USERS_TABLE: usersTable.tableName,
        USER_EMAILS_TABLE: userEmailsTable.tableName,
        JWT_SECRET_ARN: jwtSecretArn,
        JWT_EXPIRY_DAYS: String(constants.jwt_expiry_days),
        PASSWORD_SALT_ROUNDS: String(constants.password_salt_rounds)
      }
    });

    jwtSecret.grantRead(signUpLambda);
    usersTable.grantReadWriteData(signUpLambda);
    userEmailsTable.grantReadWriteData(signUpLambda);
  }

  private createLambdaFunctionLogGroup(lambdaName: string) {
    return new LogGroup(this, `${lambdaName}_lambda`, {
      logGroupName: `/aws/lambda/${lambdaName}`,
      retention: RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY
    });
  }
}
