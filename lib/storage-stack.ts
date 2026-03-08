import * as cdk from 'aws-cdk-lib/core';
import {Construct} from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import {Constants} from "../constants/constants";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";

export class StorageStack extends cdk.Stack {

  public readonly cdnBucket: s3.Bucket;

  constructor(scope: Construct, id: string, constants: Constants, props?: cdk.StackProps) {

    super(scope, id, props);

    this.cdnBucket = new s3.Bucket(this, 'CdnBucket', {
      bucketName: constants.cdn_domain_name,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      bucketKeyEnabled: true,
      cors: [
        {
          allowedOrigins: [
            constants.root_url,
            constants.localhost_url
          ],
          allowedMethods: [s3.HttpMethods.PUT],
          allowedHeaders: ['Content-Type']
        }
      ]
    });

    const rootCertificateArn = ssm.StringParameter.valueForStringParameter(this, constants.root_certificate_arn_parameter);
    const rootCertificate = acm.Certificate.fromCertificateArn(this, 'ImportedRootCertificate', rootCertificateArn);

    const cdnDistribution = new cloudfront.Distribution(this, 'cdnDistribution', {
      certificate: rootCertificate,
      domainNames: [constants.cdn_domain_name],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.cdnBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: new cloudfront.CachePolicy(this, 'CachePolicy', {
          cachePolicyName: 'AvatarCachePolicy',
          defaultTtl: cdk.Duration.days(30)
        })
      }
    });

    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: constants.root_domain_name
    });
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: constants.cdn_domain_name,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(cdnDistribution))
    });
    new route53.AaaaRecord(this, 'AliasRecordAAAA', {
      zone: hostedZone,
      recordName: constants.cdn_domain_name,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(cdnDistribution))
    });
  }
}
