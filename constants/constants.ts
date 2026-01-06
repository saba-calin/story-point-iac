export class Constants {
  public readonly root_domain_name: string;
  public readonly root_certificate_arn_parameter: string;

  constructor(constantsFile: any) {
    this.root_domain_name = constantsFile.root_domain_name;
    this.root_certificate_arn_parameter = constantsFile.root_certificate_arn_parameter;
  }
}
