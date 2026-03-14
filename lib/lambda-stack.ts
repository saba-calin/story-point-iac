import * as cdk from "aws-cdk-lib/core";
import {RemovalPolicy} from "aws-cdk-lib/core";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import {Construct} from "constructs";
import {Constants} from "../constants/constants";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import * as kms from "aws-cdk-lib/aws-kms";
import {ISecret} from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";

export class LambdaStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    constants: Constants,

    usersTable: dynamodb.TableV2,
    userEmailsTable: dynamodb.TableV2,

    roomsTable: dynamodb.TableV2,
    roomParticipantsTable: dynamodb.TableV2,

    webSocketConnectionsTable: dynamodb.TableV2,
    storiesTable: dynamodb.TableV2,
    votesTable: dynamodb.TableV2,

    cdnBucket: s3.Bucket,
    jiraTokenKey: kms.Key,

    props?: cdk.StackProps
  ) {

    super(scope, id, props);

    const jwtSecretArn = ssm.StringParameter.valueForStringParameter(this, constants.jwt_secret_arn_parameter);
    const jwtSecret = secretsmanager.Secret.fromSecretCompleteArn(this, 'JwtSecret', jwtSecretArn);
    const openAiKeySecretArn = ssm.StringParameter.valueForStringParameter(this, constants.open_ai_key_secret_arn_parameter);
    const openAiKeySecret = secretsmanager.Secret.fromSecretCompleteArn(this, 'OpenAiKeySecret', openAiKeySecretArn);

    this.deployTestLambda(constants);
    this.deployWsTestLambda(constants);

    this.deployWsConnectLambda(constants);
    this.deployWsDisconnectLambda(constants, webSocketConnectionsTable);
    this.deployWsJoinRoomLambda(constants, roomsTable, webSocketConnectionsTable, roomParticipantsTable, storiesTable, votesTable);
    this.deployWsCreateStoryLambda(constants, roomsTable, storiesTable, webSocketConnectionsTable);
    this.deployWsSetActiveStoryLambda(constants, roomsTable, storiesTable, votesTable, webSocketConnectionsTable);
    this.deployWsVoteLambda(constants, roomsTable, storiesTable, votesTable, roomParticipantsTable, webSocketConnectionsTable);
    this.deployGetAvatarUploadUrlLambda(constants, usersTable, cdnBucket);
    this.deployWsRevealLambda(constants, usersTable, roomsTable, storiesTable, votesTable, webSocketConnectionsTable, jiraTokenKey);

    this.deployCreateRoomLambda(constants, roomsTable);
    this.deployGetRoomLambda(constants, roomParticipantsTable);
    this.deployGetStoryLambda(constants, storiesTable);
    this.deployGetVoteLambda(constants, votesTable);
    this.deployAiEstimateLambda(constants, openAiKeySecretArn, openAiKeySecret);
    this.deploySaveJiraTokenLambda(constants, usersTable, jiraTokenKey);
    this.deployGetJiraProjectsLambda(constants, usersTable, jiraTokenKey);
    this.deployGetJiraStoriesLambda(constants, usersTable, jiraTokenKey);

    this.deployChangePasswordLambda(constants, usersTable);
    this.deployAuthMeLambda(constants, usersTable);
    this.deployAuthorizerLambda(constants, jwtSecretArn, jwtSecret);
    this.deployLogInLambda(constants, usersTable, jwtSecretArn, jwtSecret);
    this.deployLogOutLambda(constants);
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

  private deployWsTestLambda(constants: Constants) {
    const logGroup = this.createLambdaFunctionLogGroup('ws-test');

    const wsTestLambda = new lambda.Function(this, 'WsTestLambda', {
      functionName: 'ws-test_lambda',
      description: 'Lambda function to test the websocket connection',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/ws-test/dist/ws-test'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup
    });

    wsTestLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: ['arn:aws:execute-api:*:*:*']
    }));
  }

  private deployWsJoinRoomLambda(
    constants: Constants,
    roomsTable: dynamodb.TableV2,
    webSocketConnectionsTable: dynamodb.TableV2,
    roomParticipantsTable: dynamodb.TableV2,
    storiesTable: dynamodb.TableV2,
    votesTable: dynamodb.TableV2
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('ws-join-room');

    const wsJoinRoomLambda = new lambda.Function(this, 'WsJoinRoom', {
      functionName: 'ws-join-room_lambda',
      description: 'Lambda function that handles the event of a user joining a room',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/ws-join-room/dist/ws-join-room'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        ROOMS_TABLE: roomsTable.tableName,
        WS_CONNECTIONS_TABLE: webSocketConnectionsTable.tableName,
        ROOM_PARTICIPANTS_TABLE: roomParticipantsTable.tableName,
        STORIES_TABLE: storiesTable.tableName,
        VOTES_TABLE: votesTable.tableName,

        WS_CONNECTIONS_TABLE_INDEX: constants.ws_connections_table_index_name
      }
    });

    roomsTable.grantReadData(wsJoinRoomLambda);
    webSocketConnectionsTable.grantReadWriteData(wsJoinRoomLambda);
    roomParticipantsTable.grantReadWriteData(wsJoinRoomLambda);
    storiesTable.grantReadWriteData(wsJoinRoomLambda);
    votesTable.grantReadData(wsJoinRoomLambda);

    wsJoinRoomLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: ['arn:aws:execute-api:*:*:*']
    }));
  }

  private deployWsCreateStoryLambda(
    constants: Constants,
    roomsTable: dynamodb.TableV2,
    storiesTable: dynamodb.TableV2,
    webSocketConnectionsTable: dynamodb.TableV2
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('ws-create-story');

    const wsCreateStoryLambda = new lambda.Function(this, 'WsCreateStory', {
      functionName: 'ws-create-story_lambda',
      description: 'Lambda function that handles the creation of a story and broadcasts it to the users in the room',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/ws-create-story/dist/ws-create-story'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        ROOMS_TABLE: roomsTable.tableName,
        STORIES_TABLE: storiesTable.tableName,
        WS_CONNECTIONS_TABLE: webSocketConnectionsTable.tableName,

        WS_CONNECTIONS_TABLE_INDEX: constants.ws_connections_table_index_name
      }
    });

    roomsTable.grantReadData(wsCreateStoryLambda);
    storiesTable.grantReadWriteData(wsCreateStoryLambda);
    webSocketConnectionsTable.grantReadWriteData(wsCreateStoryLambda);

    wsCreateStoryLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: ['arn:aws:execute-api:*:*:*']
    }));
  }

  private deployWsSetActiveStoryLambda(
    constants: Constants,
    roomsTable: dynamodb.TableV2,
    storiesTable: dynamodb.TableV2,
    votesTable: dynamodb.TableV2,
    webSocketConnectionsTable: dynamodb.TableV2
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('ws-set-active-story');

    const wsSetActiveStoryLambda = new lambda.Function(this, 'WsSetActiveStory', {
      functionName: 'ws-set-active-story_lambda',
      description: 'Lambda function that handles the event of the room owner setting the active story for the room and broadcasts it to all players in the room',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/ws-set-active-story/dist/ws-set-active-story'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        ROOMS_TABLE: roomsTable.tableName,
        STORIES_TABLE: storiesTable.tableName,
        VOTES_TABLE: votesTable.tableName,
        WS_CONNECTIONS_TABLE: webSocketConnectionsTable.tableName,

        WS_CONNECTIONS_TABLE_INDEX: constants.ws_connections_table_index_name
      }
    });

    roomsTable.grantReadData(wsSetActiveStoryLambda);
    storiesTable.grantReadWriteData(wsSetActiveStoryLambda);
    votesTable.grantReadData(wsSetActiveStoryLambda);
    webSocketConnectionsTable.grantReadWriteData(wsSetActiveStoryLambda);

    wsSetActiveStoryLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: ['arn:aws:execute-api:*:*:*']
    }));
  }

  private deployWsVoteLambda(
    constants: Constants,
    roomsTable: dynamodb.TableV2,
    storiesTable: dynamodb.TableV2,
    votesTable: dynamodb.TableV2,
    roomParticipantsTable: dynamodb.TableV2,
    webSocketConnectionsTable: dynamodb.TableV2
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('ws-vote');

    const wsVoteLambda = new lambda.Function(this, 'WsVote', {
      functionName: 'ws-vote_lambda',
      description: 'Lambda function that handles the voting for a story which is set to active',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/ws-vote/dist/ws-vote'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        ROOMS_TABLE: roomsTable.tableName,
        STORIES_TABLE: storiesTable.tableName,
        VOTES_TABLE: votesTable.tableName,
        ROOM_PARTICIPANTS_TABLE: roomParticipantsTable.tableName,
        WS_CONNECTIONS_TABLE: webSocketConnectionsTable.tableName,

        WS_CONNECTIONS_TABLE_INDEX: constants.ws_connections_table_index_name
      }
    });

    roomsTable.grantReadData(wsVoteLambda);
    storiesTable.grantReadWriteData(wsVoteLambda);
    votesTable.grantReadWriteData(wsVoteLambda);
    roomParticipantsTable.grantReadWriteData(wsVoteLambda);
    webSocketConnectionsTable.grantReadWriteData(wsVoteLambda);

    wsVoteLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: ['arn:aws:execute-api:*:*:*']
    }));
  }

  private deployWsRevealLambda(
    constants: Constants,
    usersTable: dynamodb.TableV2,
    roomsTable: dynamodb.TableV2,
    storiesTable: dynamodb.TableV2,
    votesTable: dynamodb.TableV2,
    webSocketConnectionsTable: dynamodb.TableV2,
    jiraTokenKey: kms.Key
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('ws-reveal');

    const wsRevealLambda = new lambda.Function(this, 'WsReveal', {
      functionName: 'ws-reveal_lambda',
      description: 'Lambda function that reveals the cards',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/ws-reveal/dist/ws-reveal'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        USERS_TABLE: usersTable.tableName,
        ROOMS_TABLE: roomsTable.tableName,
        STORIES_TABLE: storiesTable.tableName,
        VOTES_TABLE: votesTable.tableName,
        WS_CONNECTIONS_TABLE: webSocketConnectionsTable.tableName,

        WS_CONNECTIONS_TABLE_INDEX: constants.ws_connections_table_index_name
      }
    });

    usersTable.grantReadData(wsRevealLambda);
    roomsTable.grantReadData(wsRevealLambda);
    storiesTable.grantReadWriteData(wsRevealLambda);
    votesTable.grantReadWriteData(wsRevealLambda);
    webSocketConnectionsTable.grantReadWriteData(wsRevealLambda);

    jiraTokenKey.grantDecrypt(wsRevealLambda);

    wsRevealLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: ['arn:aws:execute-api:*:*:*']
    }));
  }

  private deployWsConnectLambda(constants: Constants) {
    const logGroup = this.createLambdaFunctionLogGroup('ws-connect');

    new lambda.Function(this, 'WsConnect', {
      functionName: 'ws-connect_lambda',
      description: 'Lambda function that handles the connection to the WS API (used for authorization)',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/ws-connect/dist/ws-connect'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup
    });
  }

  private deployWsDisconnectLambda(
    constants: Constants,
    webSocketConnectionsTable: dynamodb.TableV2
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('ws-disconnect');

    const wsDisconnectLambda = new lambda.Function(this, 'WsDisconnect', {
      functionName: 'ws-disconnect_lambda',
      description: 'Lambda function that handles the disconnect event of WebSocket API',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/ws-disconnect/dist/ws-disconnect'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        WS_CONNECTIONS_TABLE: webSocketConnectionsTable.tableName,
        WS_CONNECTIONS_TABLE_INDEX: constants.ws_connections_table_index_name
      }
    });

    webSocketConnectionsTable.grantReadWriteData(wsDisconnectLambda);

    wsDisconnectLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: ['arn:aws:execute-api:*:*:*']
    }));
  }

  private deployCreateRoomLambda(
    constants: Constants,
    roomsTable: dynamodb.TableV2
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('create-room');

    const createRoomLambda = new lambda.Function(this, 'CreateRoomLambda', {
      functionName: 'create-room_lambda',
      description: 'Lambda function that handles the creation of a room',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/create-room/dist/create-room'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        ROOMS_TABLE: roomsTable.tableName
      }
    });

    roomsTable.grantReadWriteData(createRoomLambda);
  }

  private deployGetRoomLambda(
    constants: Constants,
    roomParticipantsTable: dynamodb.TableV2
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('get-room');

    const getRoomLambda = new lambda.Function(this, 'GetRoomLambda', {
      functionName: 'get-room_lambda',
      description: 'Lambda function that fetches paginated rooms where a user has participated based on username',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/get-room/dist/get-room'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        ROOM_PARTICIPANTS_TABLE: roomParticipantsTable.tableName,
        ROOM_PARTICIPANTS_TABLE_INDEX: constants.room_participants_table_index_name,

        ROOMS_PAGE_SIZE: String(constants.rooms_page_size)
      }
    });

    roomParticipantsTable.grantReadWriteData(getRoomLambda);
  }

  private deployGetStoryLambda(
    constants: Constants,
    storiesTable: dynamodb.TableV2
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('get-story');

    const getStoryLambda = new lambda.Function(this, 'GetStoryLambda', {
      functionName: 'get-story_lambda',
      description: 'Lambda function that retrieves stories based on a given room id',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/get-story/dist/get-story'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        STORIES_TABLE: storiesTable.tableName,
      }
    });

    storiesTable.grantReadWriteData(getStoryLambda);
  }

  private deployGetVoteLambda(
    constants: Constants,
    votesTable: dynamodb.TableV2
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('get-vote');

    const getVoteLambda = new lambda.Function(this, 'GetVoteLambda', {
      functionName: 'get-vote_lambda',
      description: 'Lambda function that retrieves votes based on a given story id',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/get-vote/dist/get-vote'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        VOTES_TABLE: votesTable.tableName,
      }
    });

    votesTable.grantReadWriteData(getVoteLambda);
  }

  private deployGetAvatarUploadUrlLambda(
    constants: Constants,
    usersTable: dynamodb.TableV2,
    cdnBucket: s3.Bucket
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('get-avatar-upload-url');

    const getAvatarUploadUrlLambda = new lambda.Function(this, 'GetAvatarUploadUrlLambda', {
      functionName: 'get-avatar-upload-url_lambda',
      description: 'Lambda function that generates a signed url that allows the user to upload a profile image',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/get-avatar-upload-url/dist/get-avatar-upload-url'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        USERS_TABLE: usersTable.tableName,
        MAX_IMAGE_SIZE_BYTES: String(constants.max_image_size_bytes),
        CDN_BUCKET_NAME: cdnBucket.bucketName
      }
    });

    usersTable.grantReadWriteData(getAvatarUploadUrlLambda);
    cdnBucket.grantPut(getAvatarUploadUrlLambda);
  }

  private deployAiEstimateLambda(
    constants: Constants,
    openAiKeySecretArn: string,
    openAiKeySecret: ISecret
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('ai-estimate');

    const aiEstimateLambda = new lambda.Function(this, 'AiEstimateLambda', {
      functionName: 'ai-estimate_lambda',
      description: 'Lambda function that uses ChatGpt to estimate a story based on its name and description',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/ai-estimate/dist/ai-estimate'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        OPEN_AI_SECRET_KEY_ARN: openAiKeySecretArn
      }
    });

    openAiKeySecret.grantRead(aiEstimateLambda);
  }

  private deploySaveJiraTokenLambda(
    constants: Constants,
    usersTable: dynamodb.TableV2,
    jiraTokenKey: kms.Key
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('save-jira-token');

    const saveJiraTokenLambda = new lambda.Function(this, 'SaveJiraTokenLambda', {
      functionName: 'save-jira-token_lambda',
      description: 'Lambda function that save the jira token for a user',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/save-jira-token/dist/save-jira-token'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        USERS_TABLE: usersTable.tableName,
        KMS_KEY_ID: jiraTokenKey.keyId
      }
    });

    usersTable.grantReadWriteData(saveJiraTokenLambda);
    jiraTokenKey.grantEncrypt(saveJiraTokenLambda);
  }

  private deployGetJiraProjectsLambda(
    constants: Constants,
    usersTable: dynamodb.TableV2,
    jiraTokenKey: kms.Key
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('get-jira-projects');

    const getJiraProjectsLambda = new lambda.Function(this, 'GetJiraProjectsLambda', {
      functionName: 'get-jira-projects_lambda',
      description: 'Lambda function that fetches all projects for a user based on the jira API key',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/get-jira-projects/dist/get-jira-projects'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        USERS_TABLE: usersTable.tableName
      }
    });

    usersTable.grantReadWriteData(getJiraProjectsLambda);
    jiraTokenKey.grantDecrypt(getJiraProjectsLambda);
  }

  private deployGetJiraStoriesLambda(
    constants: Constants,
    usersTable: dynamodb.TableV2,
    jiraTokenKey: kms.Key
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('get-jira-stories');

    const getJiraStoriesLambda = new lambda.Function(this, 'GetJiraStoriesLambda', {
      functionName: 'get-jira-stories_lambda',
      description: 'Lambda function that fetches all stories for a project based on the jira API key',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/get-jira-stories/dist/get-jira-stories'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        USERS_TABLE: usersTable.tableName
      }
    });

    usersTable.grantReadWriteData(getJiraStoriesLambda);
    jiraTokenKey.grantDecrypt(getJiraStoriesLambda);
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

  private deployAuthMeLambda(
    constants: Constants,
    usersTable: dynamodb.TableV2
  ) {
    const logGroup = this.createLambdaFunctionLogGroup('auth-me');

    const authMeLambda =  new lambda.Function(this, 'AuthMeLambda', {
      functionName: 'auth-me_lambda',
      description: 'Lambda function that returns the credentials of a logged in user',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/auth-me/dist/auth-me'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        USERS_TABLE: usersTable.tableName
      }
    });

    usersTable.grantReadData(authMeLambda);
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
        JWT_EXPIRY_DAYS: String(constants.jwt_expiry_days),
        ROOT_DOMAIN: constants.root_domain_name
      }
    });

    jwtSecret.grantRead(logInLambda);
    usersTable.grantReadData(logInLambda);
  }

  private deployLogOutLambda(constants: Constants) {
    const logGroup = this.createLambdaFunctionLogGroup('log-out');

    new lambda.Function(this, 'LogOutLambda', {
      functionName: 'log-out_lambda',
      description: 'Lambda function that handles the logout of the users',
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/log-out/dist/log-out'),
      memorySize: constants.lambda_memory_size,
      logGroup: logGroup,
      environment: {
        ROOT_DOMAIN: constants.root_domain_name
      }
    });
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
        PASSWORD_SALT_ROUNDS: String(constants.password_salt_rounds),
        ROOT_DOMAIN: constants.root_domain_name
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
