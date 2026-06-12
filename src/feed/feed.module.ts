import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedSearchService } from './feed-search.service';
import { FeedStream } from './feed-stream.service';
import { FeedApi } from './feed.api';
import { FeedView } from './feed.view';
import { FeedRepository } from './feed.repository';
import { HttpModule } from '@nestjs/axios';
import { RedisModule as IORedisModule } from '@nestjs-modules/ioredis'; // Alias to avoid name conflict

@Module({
  imports: [
    HttpModule,
    IORedisModule, // This refers to the configured RedisModule from app.module.ts
  ],
  controllers: [FeedController],
  providers: [FeedApi, FeedView, FeedRepository, FeedSearchService, FeedStream],
})
export class FeedModule {}
