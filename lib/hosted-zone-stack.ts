import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import {Constants} from "../constants/constants";

export class HostedZoneStack extends cdk.Stack {
  constructor(scope: Construct, id: string, constants: Constants, props?: cdk.StackProps) {

    super(scope, id, props);

    const hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: constants.root_domain_name
    });

    const rootCertificate = new acm.Certificate(this, 'RootCertificate', {
      domainName: constants.root_domain_name,
      allowExport: false,
      validation: acm.CertificateValidation.fromDns(hostedZone),
      keyAlgorithm: acm.KeyAlgorithm.RSA_2048
    });
    new ssm.StringParameter(this, 'RootCertificateArnParameter', {
      parameterName: constants.root_certificate_arn_parameter,
      stringValue: rootCertificate.certificateArn
    });
  }
}
