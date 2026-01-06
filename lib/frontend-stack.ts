import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import {Constants} from "../constants/constants";

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, constants: Constants, props?: cdk.StackProps) {

    super(scope, id, props);

    const mainBucket = new s3.Bucket(this, 'MainBucket', {
      bucketName: constants.root_domain_name,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      bucketKeyEnabled: true,
      objectLockEnabled: false,
    });

    const rootCertificateArn = ssm.StringParameter.valueForStringParameter(this, constants.root_certificate_arn_parameter);
    const rootCertificate = acm.Certificate.fromCertificateArn(this, 'ImportedRootCertificate', rootCertificateArn);

    const mainDistribution = new cloudfront.Distribution(this, 'MainDistribution', {
      certificate: rootCertificate,
      defaultRootObject: "index.html",
      domainNames: [constants.root_domain_name],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(mainBucket)
      }
    });

    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: constants.root_domain_name
    });
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: constants.root_domain_name,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(mainDistribution))
    });
    new route53.AaaaRecord(this, 'AliasRecordAAAA', {
      zone: hostedZone,
      recordName: constants.root_domain_name,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(mainDistribution))
    });


    // create the www version

  }
}
