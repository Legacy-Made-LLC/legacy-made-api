import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Config } from '../config';

@Injectable()
export class ApiConfigService {
  constructor(private readonly config: ConfigService<Config, true>) {}

  get<T extends keyof Config>(key: T) {
    // The `infer` option is what tells the config service we want typed return values.
    return this.config.get(key, { infer: true });
  }
}
