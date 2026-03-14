import * as cdk from 'aws-cdk-lib/core';
import {RemovalPolicy} from 'aws-cdk-lib/core';
import {Construct} from 'constructs';
import * as kms from "aws-cdk-lib/aws-kms";
import {KeyUsage} from "aws-cdk-lib/aws-kms";
import {Constants} from "../constants/constants";

export class KmsStack extends cdk.Stack {

  public readonly jiraTokenKey: kms.Key;

  constructor(scope: Construct, id: string, constants: Constants, props?: cdk.StackProps) {

    super(scope, id, props);

    this.jiraTokenKey = new kms.Key(this, 'JiraTokenKey', {
      alias: 'JiraTokenKey',
      description: 'KMS key used for encrypting Jira API tokens',
      keyUsage: KeyUsage.ENCRYPT_DECRYPT,
      removalPolicy: RemovalPolicy.DESTROY
    });
  }
}
