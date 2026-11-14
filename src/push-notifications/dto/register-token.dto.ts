import Expo from 'expo-server-sdk';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const registerTokenSchema = z.object({
  token: z
    .string()
    .min(1)
    .max(256)
    .refine((token) => Expo.isExpoPushToken(token), {
      error: 'Not an Expo push token',
    }),
  platform: z.enum(['ios', 'android']).optional(),
});

export class RegisterTokenDto extends createZodDto(registerTokenSchema) {}
