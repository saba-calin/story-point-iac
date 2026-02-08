import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import {Constants} from "../constants/constants";

export class HostedZoneStack extends cdk.Stack {
  public readonly customDomainName: apigwv2.DomainName;

  constructor(scope: Construct, id: string, constants: Constants, props?: cdk.StackProps) {

    super(scope, id, props);

    // The ns records must be manually updated from the registrar
    // const hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
    //   zoneName: constants.root_domain_name
    // });
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: constants.root_domain_name,
    });

    const rootCertificate = new acm.Certificate(this, 'RootCertificate', {
      domainName: constants.root_domain_name,
      subjectAlternativeNames:[
        constants.www_domain_name,
        constants.api_domain_name
      ],
      allowExport: false,
      validation: acm.CertificateValidation.fromDns(hostedZone),
      keyAlgorithm: acm.KeyAlgorithm.RSA_2048
    });
    new ssm.StringParameter(this, 'RootCertificateArnParameter', {
      parameterName: constants.root_certificate_arn_parameter,
      stringValue: rootCertificate.certificateArn
    });

    this.customDomainName = new apigwv2.DomainName(this, 'CustomDomainName', {
      domainName: constants.api_domain_name,
      endpointType: apigwv2.EndpointType.REGIONAL,
      ipAddressType: apigwv2.IpAddressType.IPV4,
      securityPolicy: apigwv2.SecurityPolicy.TLS_1_2,
      certificate: rootCertificate
    });
    new route53.ARecord(this, 'CustomDomainNameARecord', {
      zone: hostedZone,
      recordName: constants.api_domain_name,
      target: route53.RecordTarget.fromAlias(
        new targets.ApiGatewayv2DomainProperties(
          this.customDomainName.regionalDomainName,
          this.customDomainName.regionalHostedZoneId
        )
      )
    });
  }
}
