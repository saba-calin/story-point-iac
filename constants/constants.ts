export class Constants {

  public readonly root_domain_name: string;
  public readonly www_domain_name: string;
  public readonly cdn_domain_name: string;
  public readonly api_domain_name: string;
  public readonly ws_domain_name: string;
  public readonly root_certificate_arn_parameter: string;
  public readonly jwt_secret_arn_parameter: string;
  public readonly open_ai_key_secret_arn_parameter: string;
  public readonly localhost_url: string;
  public readonly root_url: string;
  public readonly ws_connections_table_index_name: string;
  public readonly room_participants_table_index_name: string;
  public readonly refresh_tokens_table_index_name: string;
  public readonly lambda_memory_size: number;
  public readonly access_token_expiry_minutes: number;
  public readonly refresh_token_expiry_days: number;
  public readonly password_salt_rounds: number;
  public readonly rooms_page_size: number;
  public readonly users_page_size: number;
  public readonly max_image_size_bytes: number;

  constructor(constantsFile: any) {
    this.root_domain_name = constantsFile.root_domain_name;
    this.www_domain_name = constantsFile.www_domain_name;
    this.cdn_domain_name = constantsFile.cdn_domain_name;
    this.api_domain_name = constantsFile.api_domain_name;
    this.ws_domain_name = constantsFile.ws_domain_name;
    this.root_certificate_arn_parameter = constantsFile.root_certificate_arn_parameter;
    this.jwt_secret_arn_parameter = constantsFile.jwt_secret_arn_parameter;
    this.open_ai_key_secret_arn_parameter = constantsFile.open_ai_key_secret_arn_parameter;
    this.localhost_url = constantsFile.localhost_url;
    this.root_url = constantsFile.root_url;
    this.ws_connections_table_index_name = constantsFile.ws_connections_table_index_name;
    this.room_participants_table_index_name = constantsFile.room_participants_table_index_name;
    this.refresh_tokens_table_index_name = constantsFile.refresh_tokens_table_index_name;
    this.lambda_memory_size = constantsFile.lambda_memory_size;
    this.access_token_expiry_minutes = constantsFile.access_token_expiry_minutes;
    this.refresh_token_expiry_days = constantsFile.refresh_token_expiry_days;
    this.password_salt_rounds = constantsFile.password_salt_rounds;
    this.rooms_page_size = constantsFile.rooms_page_size;
    this.users_page_size = constantsFile.users_page_size;
    this.max_image_size_bytes = constantsFile.max_image_size_bytes;
  }
}
