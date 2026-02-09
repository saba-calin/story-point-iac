import * as cdk from 'aws-cdk-lib/core';
import {Construct} from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import {Constants} from "../constants/constants";

export class SecretsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, constants: Constants, props?: cdk.StackProps) {

    super(scope, id, props);

    const jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: 'jwt_secret_key',
      description: 'JWT secret used to signing tokens',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'secret',
        excludePunctuation: true,
        passwordLength: 64
      }
    });
    new ssm.StringParameter(this, 'JwtSecretArnParameter', {
      parameterName: constants.jwt_secret_arn_parameter,
      stringValue: jwtSecret.secretArn
    });
  }
}
