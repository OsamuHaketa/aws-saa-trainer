/** 知識ページのサービス一覧の分け方。ここにないサービスは「その他」に入る */
export const SERVICE_GROUPS: { label: string; services: string[] }[] = [
  { label: "設計の土台", services: ["infrastructure", "patterns"] },
  { label: "ストレージ", services: ["s3", "ebs", "efs", "fsx", "storagegateway", "backup"] },
  { label: "コンピューティング", services: ["ec2", "autoscaling", "lambda", "ecs", "eks", "batch", "beanstalk"] },
  { label: "ネットワーク・配信", services: ["vpc", "elb", "cloudfront", "globalaccelerator", "route53", "apigateway"] },
  {
    label: "データベース",
    services: ["rds", "dynamodb", "elasticache", "memorydb", "documentdb", "neptune", "keyspaces", "timestream"],
  },
  {
    label: "セキュリティ・ID",
    services: [
      "iam", "organizations", "cognito", "kms", "secretsmanager", "waf", "shield",
      "guardduty", "inspector", "macie", "securityhub", "detective",
    ],
  },
  { label: "アプリケーション統合", services: ["sqs", "sns", "eventbridge", "stepfunctions", "appsync", "mq"] },
  {
    label: "分析",
    services: ["kinesis", "msk", "athena", "glue", "lakeformation", "emr", "redshift", "opensearch", "quicksight"],
  },
  {
    label: "運用・ガバナンス",
    services: ["cloudwatch", "cloudtrail", "config", "ssm", "cloudformation", "xray", "trustedadvisor", "cost"],
  },
  { label: "移行・DR", services: ["dms", "datasync", "snow", "transfer", "mgn", "drs"] },
  { label: "AI / ML", services: ["ai"] },
];

// サービス ID とアイコンのファイル名が違うもの
const ICON_OVERRIDE: Record<string, string> = {
  infrastructure: "grp-region",
  patterns: "wellarchitected",
};

/** public/aws-icons/ のアイコン名 */
export const serviceIcon = (service: string) => ICON_OVERRIDE[service] ?? service;

/** アイコンの URL。g- で始まる汎用アイコンは黒一色なので、ダークモードでは反転させる（mono） */
export const iconSrc = (key: string) => `/aws-icons/${key}.svg`;
export const isMonoIcon = (key: string) => key.startsWith("g-");
