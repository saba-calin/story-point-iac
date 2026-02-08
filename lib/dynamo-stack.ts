import * as cdk from "aws-cdk-lib/core";
import {Construct} from "constructs";
import {Constants} from "../constants/constants";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class DynamoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, constants: Constants, props?: cdk.StackProps) {

    super(scope, id, props);

    const usersTable = new dynamodb.TableV2(this, 'UsersTable', {
      tableName: 'Users',
      partitionKey: {name: 'username', type: dynamodb.AttributeType.STRING},
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    usersTable.addGlobalSecondaryIndex({
      indexName: 'EmailIndex',
      partitionKey: {name: 'email', type: dynamodb.AttributeType.STRING},
      projectionType: dynamodb.ProjectionType.ALL
    });
  }
}
