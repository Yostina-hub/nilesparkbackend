// courses/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || 'supersecret',
      passReqToCallback: true,
    });
  }

  async validate(request: any, payload: any) {
    if (!payload.sub || !payload.roles) {
      console.error('JwtStrategy validate - Invalid payload:', payload);
      throw new UnauthorizedException('Invalid token payload');
    }

    const authServiceUrl =
      this.configService.get('AUTH_SERVICE_URL') || 'http://auth:3001';
    const token = request.headers.authorization?.replace('Bearer ', '');

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${authServiceUrl}/auth/verify`,
          { token },
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        ),
      );

      const { id, roles } = response.data.body;
      if (!id || !roles) {
        console.error(
          'JwtStrategy validate - Invalid response:',
          response.data,
        );
        throw new UnauthorizedException('Invalid token response');
      }

      // Normalize roles from auth service response
      const normalizedAuthRoles = roles.map((role: any) =>
        typeof role === 'string' ? role : role.name,
      );
      // Normalize roles from JWT payload
      const normalizedPayloadRoles = payload.roles.map((role: any) =>
        typeof role === 'string' ? role : role.name,
      );

      // Validate roles match
      const rolesMatch = normalizedAuthRoles.every((role: string) =>
        normalizedPayloadRoles.includes(role),
      );

      if (!rolesMatch) {
        console.error(
          'JwtStrategy validate - Roles mismatch between payload and auth service',
        );
        throw new UnauthorizedException('Token roles mismatch');
      }

      return {
        id: payload.sub,
        roles: normalizedAuthRoles,
      };
    } catch (error) {
      console.error('JwtStrategy validate - Error:', error.message);
      throw new UnauthorizedException(
        'Token validation failed with auth service',
      );
    }
  }
}
