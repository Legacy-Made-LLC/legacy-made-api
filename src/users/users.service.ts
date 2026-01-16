import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from 'src/db/db.service';
import { NewUser, users } from 'src/schema';

@Injectable()
export class UsersService {
  constructor(private readonly db: DbService) {}

  async createUser(user: NewUser) {
    const [created] = await this.db.drizzle
      .insert(users)
      .values(user)
      .returning();
    return created;
  }

  async updateUser(
    id: string,
    data: Partial<Omit<NewUser, 'id' | 'createdAt'>>,
  ) {
    const [updated] = await this.db.drizzle
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async deleteUser(id: string) {
    const [deleted] = await this.db.drizzle
      .delete(users)
      .where(eq(users.id, id))
      .returning();
    return deleted;
  }

  async findById(id: string) {
    const [user] = await this.db.drizzle
      .select()
      .from(users)
      .where(eq(users.id, id));
    return user;
  }
}
