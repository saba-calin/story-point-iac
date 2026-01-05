import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as route53 from 'aws-cdk-lib/aws-route53';

export class HostedZoneStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: 'story-point.xyz'
    });
  }
}
