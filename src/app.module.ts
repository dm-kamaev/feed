import { Module } from '@nestjs/common';
import { FeedModule } from './feed/feed.module';
import { RedisModule } from '@nestjs-modules/ioredis';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    FeedModule,
    RedisModule.forRoot({
      type: 'single',
      url: process.env['REDIS_URL'] || 'redis://localhost:6379',
    }),
    HttpModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
