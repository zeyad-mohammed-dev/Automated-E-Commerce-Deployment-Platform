import { S3_BUCKET, S3_REGION, S3_PUBLIC_BASE_URL } from '../../config/config.js';

let s3Client;

const getClient = async () => {
  if (!s3Client) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    // credentials come from the default AWS chain (env vars or the EC2 instance role)
    s3Client = new S3Client({ region: S3_REGION });
  }
  return s3Client;
};

export const putS3 = async ({ buffer, key, mimetype }) => {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      CacheControl: 'public, max-age=31536000',
    }),
  );

  const base = S3_PUBLIC_BASE_URL || `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;
  return { url: `${base.replace(/\/$/, '')}/${key}` };
};
