#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import {HostedZoneStack} from "../lib/hosted-zone-stack";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
};

new HostedZoneStack(app, 'HostedZoneStack', {
  env: env,
  description: 'Stack used to create the hosted zone'
});
