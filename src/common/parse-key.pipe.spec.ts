import { BadRequestException } from '@nestjs/common';
import { ParseKeyPipe } from './parse-key.pipe';

describe('ParseKeyPipe', () => {
  const pipe = new ParseKeyPipe();
  const metadata = { data: 'key', type: 'param' as const, metatype: String };

  it('should be defined', () => {
    expect(pipe).toBeDefined();
  });

  it('should accept valid keys', () => {
    expect(pipe.transform('valid-key', metadata)).toBe('valid-key');
    expect(pipe.transform('valid_key', metadata)).toBe('valid_key');
    expect(pipe.transform('key123', metadata)).toBe('key123');
    expect(pipe.transform('a', metadata)).toBe('a');
    expect(pipe.transform('dotted.key', metadata)).toBe('dotted.key');
    expect(pipe.transform('a.b.c', metadata)).toBe('a.b.c');
  });

  it('should reject empty strings', () => {
    expect(() => pipe.transform('', metadata)).toThrow(BadRequestException);
  });

  it('should reject strings exceeding max length', () => {
    const longKey = 'a'.repeat(256);
    expect(() => pipe.transform(longKey, metadata)).toThrow(
      BadRequestException,
    );
  });

  it('should accept strings at max length', () => {
    const maxKey = 'a'.repeat(255);
    expect(pipe.transform(maxKey, metadata)).toBe(maxKey);
  });

  it('should reject keys with invalid characters', () => {
    expect(() => pipe.transform('key with spaces', metadata)).toThrow(
      BadRequestException,
    );
    expect(() => pipe.transform('key/slash', metadata)).toThrow(
      BadRequestException,
    );
    expect(() => pipe.transform('key@at', metadata)).toThrow(
      BadRequestException,
    );
  });
});
