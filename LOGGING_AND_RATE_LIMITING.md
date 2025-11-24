# Winston Logging & Rate Limiting Implementation

This document describes the Winston logging and rate limiting implementation added to the UNV AI Report server.

## Winston Logging

### Overview
Winston is a versatile logging library that provides:
- Multiple log levels (error, warn, info, http, debug)
- Log rotation with `winston-daily-rotate-file`
- Separate log files for different log levels
- Structured JSON logging for easy parsing
- Console output in development mode

### Configuration
Location: `src/lib/logger.ts`

### Log Files
All logs are stored in the `/logs` directory:

1. **Error Logs**: `error-YYYY-MM-DD.log`
   - Contains only error-level logs
   - Retained for 14 days
   - Max file size: 20MB
   - Compressed archives after rotation

2. **Combined Logs**: `combined-YYYY-MM-DD.log`
   - Contains all log levels (info, warn, error, http, debug)
   - Retained for 30 days
   - Max file size: 20MB
   - Compressed archives after rotation

3. **Access Logs**: `access-YYYY-MM-DD.log`
   - Contains HTTP request logs
   - Retained for 30 days
   - Max file size: 20MB
   - Compressed archives after rotation

### Log Format
Production logs are in JSON format:
```json
{
  "timestamp": "2025-10-08 12:34:56",
  "level": "info",
  "message": "Server running on http://localhost:3000",
  "service": "unv-ai-report"
}
```

Development logs are colorized and human-readable:
```
2025-10-08 12:34:56 [info]: Server running on http://localhost:3000
```

### Usage Examples

```typescript
import logger from './src/lib/logger';

// Info level
logger.info('User logged in', { userId: '123', username: 'admin' });

// Error level
logger.error('Database connection failed', { error: err.message });

// Warning level
logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });

// HTTP level (automatically logged via middleware)
logger.http('GET /api/users', { statusCode: 200, duration: '45ms' });

// Debug level
logger.debug('Cache hit', { key: 'user:123' });
```

### Automatic HTTP Request Logging
All HTTP requests are automatically logged with:
- HTTP method
- Request path
- Status code
- Response duration
- Client IP
- User agent

## Rate Limiting

### Overview
Rate limiting protects the API from abuse by limiting the number of requests from a single IP address within a time window.

### Configuration
Location: `src/middleware/rateLimiter.ts`

### Rate Limiters

1. **General API Limiter** (`apiLimiter`)
   - Applied to: All `/api/*` routes
   - Limit: 100 requests per 15 minutes
   - Response: 429 Too Many Requests
   - Headers: `RateLimit-*` headers included

2. **Authentication Limiter** (`authLimiter`)
   - Applied to: `/api/auth/*` routes
   - Limit: 5 login attempts per 15 minutes
   - Response: 429 Too Many Requests
   - Skip successful requests: Yes (only failed attempts count)
   - Purpose: Prevent brute force attacks

3. **Upload Limiter** (`uploadLimiter`)
   - Applied to: `/api/files/*` routes
   - Limit: 20 uploads per hour
   - Response: 429 Too Many Requests
   - Purpose: Prevent storage abuse

### Rate Limit Headers
When a request is rate-limited, the following headers are returned:

```
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 1696780800
```

### Rate Limit Response
When rate limit is exceeded:

```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

### Testing Rate Limits

You can test rate limiting using curl:

```bash
# Test general API limit (100 requests per 15 min)
for i in {1..101}; do
  curl -X GET http://localhost:3000/api/health
  echo "Request $i"
done

# Test auth limit (5 attempts per 15 min)
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"wrong"}'
  echo "Attempt $i"
done

# Test upload limit (20 uploads per hour)
for i in {1..21}; do
  curl -X POST http://localhost:3000/api/files/audio \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -F "file=@test.wav"
  echo "Upload $i"
done
```

## Security Best Practices

### Winston Logging Security
1. **Never log sensitive data**: Don't log passwords, tokens, or PII
2. **Structured logging**: Use metadata objects for structured data
3. **Log rotation**: Automatically compress and delete old logs
4. **Access control**: Ensure log files have proper permissions (600)
5. **Monitoring**: Set up alerts for error spikes

### Rate Limiting Security
1. **IP-based limiting**: Limits are per IP address
2. **Distributed systems**: For multi-server setups, use Redis-based rate limiting
3. **Whitelist**: Consider whitelisting trusted IPs
4. **Custom limits**: Adjust limits based on your application's needs
5. **DDoS protection**: Combine with CloudFlare or similar services

## Environment Variables

```env
# Winston Logging
LOG_LEVEL=info  # Options: error, warn, info, http, debug
NODE_ENV=production  # Set to 'development' for console logs

# Rate Limiting (optional - defaults are built-in)
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes in ms
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5
UPLOAD_RATE_LIMIT_MAX=20
```

## Monitoring & Maintenance

### Log Monitoring
1. Check disk space regularly: `du -sh /logs`
2. Monitor error rates: `grep -c '"level":"error"' logs/error-*.log`
3. Analyze access patterns: `grep '"level":"http"' logs/access-*.log | jq`

### Rate Limit Monitoring
1. Watch for rate limit warnings in logs
2. Analyze blocked IPs: `grep "Rate limit exceeded" logs/combined-*.log`
3. Adjust limits based on legitimate traffic patterns

## Troubleshooting

### Winston Issues
- **Logs not appearing**: Check `logs/` directory permissions
- **Disk full**: Reduce retention days or increase compression
- **Performance impact**: Use async logging (already configured)

### Rate Limiting Issues
- **Legitimate users blocked**: Increase limits or implement API keys
- **Memory usage high**: Consider Redis-based rate limiting for production
- **False positives**: Implement IP whitelisting for known good IPs

## Production Recommendations

1. **Use Redis for rate limiting** in multi-server deployments:
   ```typescript
   import RedisStore from 'rate-limit-redis';
   import { createClient } from 'redis';
   
   const client = createClient({ url: process.env.REDIS_URL });
   
   export const apiLimiter = rateLimit({
     store: new RedisStore({ client }),
     // ... other options
   });
   ```

2. **Set up log aggregation** (ELK Stack, Datadog, etc.)
3. **Configure alerts** for error rate thresholds
4. **Regular log analysis** for security incidents
5. **Backup logs** before they're rotated out

## Additional Resources

- [Winston Documentation](https://github.com/winstonjs/winston)
- [express-rate-limit Documentation](https://github.com/express-rate-limit/express-rate-limit)
- [OWASP Rate Limiting Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
