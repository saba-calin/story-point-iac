#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import {HostedZoneStack} from "../lib/hosted-zone-stack";
import {FrontendStack} from "../lib/frontend-stack";
import * as fs from 'fs';
import * as path from 'path';
import {Constants} from "../constants/constants";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
};
const constantsFile = JSON.parse(fs.readFileSync(path.join(__dirname, '../constants/constants.json'), 'utf-8'));
const constants = new Constants(constantsFile);

new HostedZoneStack(app, 'HostedZoneStack', constants, {
  env: env,
  description: 'Stack used to create the hosted zone and required acm certificates'
});

new FrontendStack(app, 'FrontendStack', constants, {
  env: env,
  description: 'Stack used to create buckets and cloudfront distributions for the frontend'
});
