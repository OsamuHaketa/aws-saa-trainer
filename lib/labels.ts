import type { MistakeType } from "./db/schema";
import type { PickReason } from "./scheduler";
import type { QuestionType } from "./schema/question";

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  definition: "用語→意味",
  selection: "条件→用語",
  compare: "比較",
  trigger: "トリガー",
  antipattern: "アンチパターン",
  relation: "関連",
  scenario: "シナリオ",
  exam: "本番型",
};

export const SERVICE_LABEL: Record<string, string> = {
  s3: "S3",
  ec2: "EC2",
  ebs: "EBS",
  efs: "EFS",
  fsx: "FSx",
  vpc: "VPC",
  iam: "IAM",
  rds: "RDS",
  aurora: "Aurora",
  dynamodb: "DynamoDB",
  elasticache: "ElastiCache",
  elb: "ELB",
  autoscaling: "Auto Scaling",
  cloudfront: "CloudFront",
  globalaccelerator: "Global Accelerator",
  route53: "Route 53",
  lambda: "Lambda",
  apigateway: "API Gateway",
  sqs: "SQS",
  sns: "SNS",
  eventbridge: "EventBridge",
  kinesis: "Kinesis",
  cloudwatch: "CloudWatch",
  cloudtrail: "CloudTrail",
  config: "AWS Config",
  organizations: "Organizations",
  kms: "KMS",
};

export const serviceLabel = (s: string) => SERVICE_LABEL[s] ?? s.toUpperCase();

export const CATEGORY_LABEL: Record<string, string> = {
  "storage-class": "ストレージクラス",
  security: "セキュリティ",
  encryption: "暗号化",
  "data-management": "データ管理",
  performance: "パフォーマンス",
  architecture: "アーキテクチャ",
  purchasing: "購入オプション",
  instance: "インスタンス",
  placement: "配置",
  networking: "ネットワーク",
  connectivity: "接続",
  "access-control": "アクセス制御",
  identity: "ID 管理",
  availability: "可用性",
  scaling: "スケーリング",
  backup: "バックアップ・復旧",
  "load-balancing": "負荷分散",
  routing: "ルーティング",
  messaging: "メッセージング",
  streaming: "ストリーミング",
  monitoring: "監視",
  governance: "ガバナンス",
  caching: "キャッシュ",
  storage: "ストレージ",
  compute: "コンピューティング",
  database: "データベース",
  "edge-security": "エッジのセキュリティ",
  dns: "DNS",
  "file-storage": "ファイルストレージ",
  "block-storage": "ブロックストレージ",
  audit: "監査",
};

export const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? c;

/** 知識ページの Atom へのリンク */
export const knowledgeHref = (service: string, atomId: string) => `/knowledge?service=${service}#${atomId}`;

/** "S3 / ストレージクラス" の形式 */
export const groupLabel = (service: string, category: string) => `${serviceLabel(service)} / ${categoryLabel(category)}`;

export const REASON_LABEL: Record<PickReason, string> = {
  followup: "見分け",
  learning: "学習中",
  review: "復習",
  new: "新規",
  ahead: "学習中",
};

export const MISTAKE_LABEL: Record<MistakeType, string> = {
  unknown: "知らなかった",
  forgot: "忘れていた",
  confused: "別のものと混同した",
  misread: "問題文を読み違えた",
  detail: "数値・制限を忘れた",
};
