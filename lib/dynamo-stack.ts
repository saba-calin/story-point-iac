import * as cdk from "aws-cdk-lib/core";
import {Construct} from "constructs";
import {Constants} from "../constants/constants";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class DynamoStack extends cdk.Stack {
  public readonly usersTable: dynamodb.TableV2;
  public readonly userEmailsTable: dynamodb.TableV2;

  constructor(scope: Construct, id: string, constants: Constants, props?: cdk.StackProps) {

    super(scope, id, props);

    this.usersTable = new dynamodb.TableV2(this, 'UsersTable', {
      tableName: 'Users',
      partitionKey: {name: 'username', type: dynamodb.AttributeType.STRING},
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    this.userEmailsTable = new dynamodb.TableV2(this, 'UserEmailsTable', {
      tableName: 'UserEmails',
      partitionKey: {name: 'email', type: dynamodb.AttributeType.STRING},
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
  }
}
