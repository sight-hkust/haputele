import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';

describe('PostgreSQL Test with Testcontainers', () => {
  let container: StartedPostgreSqlContainer;
  let client: Client | undefined;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:latest')
      .withDatabase('testdb')
      .withUsername('testuser')
      .withPassword('testpass')
      .withStartupTimeout(120000) 
      .start();

    client = new Client({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: container.getUsername(),
      password: container.getPassword(),
    });

    await client.connect();

    await client.query('CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL)');
  }, 120000); 

  afterAll(async () => {
    // Clean up
    if (client) {
      await client.end();
    }
    await container.stop();
  });

  it('should insert and retrieve a user from PostgreSQL', async () => {
    if (!client) throw new Error('PostgreSQL client is not initialized');

    // Insert a user
    await client.query('INSERT INTO users (name) VALUES ($1)', ['Test User']);
    const allRows = await client.query('SELECT * FROM users');
    console.log('Users table contents:', allRows.rows);

    const result = await client.query('SELECT * FROM users WHERE name = $1', ['Test User']);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Test User');
  });
});