import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  transport: {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT!, 10),
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASSWORD,
    },
    secure: process.env.MAIL_SECURE === 'true',
  },
  defaults: {
    from: process.env.MAIL_USER,
  },
}));
