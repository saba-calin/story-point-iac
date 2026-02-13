import * as cdk from "aws-cdk-lib/core";
import {Construct} from "constructs";
import {Constants} from "../constants/constants";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class DynamoStack extends cdk.Stack {
  public readonly usersTable: dynamodb.TableV2;
  public readonly userEmailsTable: dynamodb.TableV2;

  public readonly roomsTable: dynamodb.TableV2;
  public readonly roomParticipantsTable: dynamodb.TableV2;

  public readonly webSocketConnectionsTable: dynamodb.TableV2;

  public readonly storiesTable: dynamodb.TableV2;
  public readonly votesTable: dynamodb.TableV2;

  constructor(scope: Construct, id: string, constants: Constants, props?: cdk.StackProps) {

    super(scope, id, props);

    // Users
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

    // Rooms
    this.roomsTable = new dynamodb.TableV2(this, 'RoomsTable', {
      tableName: 'Rooms',
      partitionKey: {name: 'roomId', type: dynamodb.AttributeType.STRING},
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    this.roomParticipantsTable = new dynamodb.TableV2(this, 'RoomParticipantsTable', {
      tableName: 'RoomParticipants',
      partitionKey: {name: 'roomId', type: dynamodb.AttributeType.STRING},
      sortKey: {name: 'username', type: dynamodb.AttributeType.STRING},
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Web-Socket Connections
    this.webSocketConnectionsTable = new dynamodb.TableV2(this, 'WebSocketConnectionsTable', {
      tableName: 'WebSocketConnections',
      partitionKey: {name: 'connectionId', type: dynamodb.AttributeType.STRING},
      globalSecondaryIndexes: [
        {
          indexName: 'connectionIdsByRoom',
          partitionKey: {name: 'roomId', type: dynamodb.AttributeType.STRING},
          sortKey: {name: 'connectionId', type: dynamodb.AttributeType.STRING}
        }
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Stories
    this.storiesTable = new dynamodb.TableV2(this, 'StoriesTable', {
      tableName: 'Stories',
      partitionKey: {name: 'roomId', type: dynamodb.AttributeType.STRING},
      sortKey: {name: 'storyId', type: dynamodb.AttributeType.STRING},
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Votes
    this.votesTable = new dynamodb.TableV2(this, 'VotesTable', {
      tableName: 'VotesTable',
      partitionKey: {name: 'storyId', type: dynamodb.AttributeType.STRING},
      sortKey: {name: 'username', type: dynamodb.AttributeType.STRING},
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
  }
}
