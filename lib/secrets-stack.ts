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

    // Must be set manually: {"secret": "sk-..."}
    const openAiKeySecret = new secretsmanager.Secret(this, 'OpenAiKeySecret', {
      secretName: 'open_ai_secret_key',
      description: 'OpenAI key used to make requests to ChatGPT',
    });
    new ssm.StringParameter(this, 'OpenAiKeySecretArnParameter', {
      parameterName: constants.open_ai_key_secret_arn_parameter,
      stringValue: openAiKeySecret.secretArn
    });
  }
}
