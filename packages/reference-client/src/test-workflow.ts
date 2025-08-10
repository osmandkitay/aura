import 'dotenv/config';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { AuraManifest, AuraState } from 'aura-protocol';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  details?: any;
}

class AuraTestRunner {
  private baseUrl: string;
  private results: TestResult[] = [];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async test(name: string, testFn: () => Promise<void>): Promise<void> {
    console.log(`🧪 Running test: ${name}`);
    try {
      await testFn();
      this.results.push({ name, success: true });
      console.log(`✅ ${name} - PASSED`);
    } catch (error) {
      this.results.push({ 
        name, 
        success: false, 
        error: (error as Error).message,
        details: error
      });
      console.log(`❌ ${name} - FAILED: ${(error as Error).message}`);
    }
  }

  async runAllTests(): Promise<void> {
    console.log(`🚀 Starting AURA Protocol Test Suite against ${this.baseUrl}\n`);

    await this.test('1. Fetch AURA Manifest', async () => {
      const response = await axios.get(`${this.baseUrl}/.well-known/aura.json`);
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.protocol || response.data.protocol !== 'AURA') {
        throw new Error('Invalid AURA manifest - missing or incorrect protocol field');
      }
      if (!response.data.capabilities) throw new Error('No capabilities defined in manifest');
      console.log(`   📋 Found ${Object.keys(response.data.capabilities).length} capabilities`);
    });

    await this.test('2. Unauthenticated State Check', async () => {
      const response = await axios.get(`${this.baseUrl}/api/posts`);
      const auraStateHeader = response.headers['aura-state'];
      if (!auraStateHeader) throw new Error('Missing AURA-State header');
      
      const auraState: AuraState = JSON.parse(Buffer.from(auraStateHeader, 'base64').toString('utf-8'));
      if (auraState.isAuthenticated !== false) throw new Error('Should be unauthenticated');
      if (!auraState.capabilities?.includes('login')) throw new Error('Should have login capability');
      if (auraState.capabilities?.includes('create_post')) throw new Error('Should not have create_post capability');
      
      console.log(`   🔓 Unauthenticated capabilities: ${auraState.capabilities?.join(', ')}`);
    });

    await this.test('3. Authentication Flow', async () => {
      const cookieJar = new CookieJar();
      const client = wrapper(axios.create({
        jar: cookieJar,
        withCredentials: true,
        validateStatus: () => true
      }));

      // Test login
      const loginResponse = await client.post(`${this.baseUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });

      if (loginResponse.status !== 200) {
        throw new Error(`Login failed with status ${loginResponse.status}: ${JSON.stringify(loginResponse.data)}`);
      }

      if (!loginResponse.data.success) throw new Error('Login response indicates failure');
      if (!loginResponse.data.user) throw new Error('No user data in login response');

      // Check if cookie was set
      const cookies = await cookieJar.getCookies(this.baseUrl);
      const authCookie = cookies.find(cookie => cookie.key === 'auth-token');
      if (!authCookie || !authCookie.value) throw new Error('Auth cookie was not set');

      console.log(`   🔐 Login successful for user: ${loginResponse.data.user.email}`);
    });

    await this.test('4. Authenticated State Check', async () => {
      const cookieJar = new CookieJar();
      const client = wrapper(axios.create({
        jar: cookieJar,
        withCredentials: true,
        validateStatus: () => true
      }));

      // Login first
      await client.post(`${this.baseUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });

      // Check authenticated state
      const response = await client.get(`${this.baseUrl}/api/posts`);
      const auraStateHeader = response.headers['aura-state'];
      if (!auraStateHeader) throw new Error('Missing AURA-State header');

      const auraState: AuraState = JSON.parse(Buffer.from(auraStateHeader, 'base64').toString('utf-8'));
      if (auraState.isAuthenticated !== true) throw new Error('Should be authenticated');
      if (!auraState.capabilities?.includes('create_post')) throw new Error('Should have create_post capability');
      if (!auraState.capabilities?.includes('list_posts')) throw new Error('Should have list_posts capability');

      console.log(`   🔑 Authenticated capabilities: ${auraState.capabilities?.join(', ')}`);
    });

    await this.test('5. Unauthorized Create Post Attempt', async () => {
      const client = axios.create({ validateStatus: () => true });
      
      const response = await client.post(`${this.baseUrl}/api/posts`, {
        title: 'Unauthorized Test Post',
        content: 'This should fail.'
      });
      
      if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
      if (response.data.code !== 'UNAUTHORIZED') throw new Error('Expected UNAUTHORIZED error code');
      
      console.log(`   🚫 Correctly rejected unauthorized request`);
    });

    await this.test('6. Authorized Create Post', async () => {
      const cookieJar = new CookieJar();
      const client = wrapper(axios.create({
        jar: cookieJar,
        withCredentials: true,
        validateStatus: () => true
      }));

      // Login first
      await client.post(`${this.baseUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });

      // Create post
      const newPost = {
        title: `Test Post ${Date.now()}`,
        content: 'This is a test post created by the AURA test runner.',
        tags: ['test', 'automation'],
        published: true
      };

      const response = await client.post(`${this.baseUrl}/api/posts`, newPost);
      if (response.status !== 201) {
        throw new Error(`Expected 201, got ${response.status}: ${JSON.stringify(response.data)}`);
      }

      if (response.data.title !== newPost.title) throw new Error('Post title mismatch');
      if (response.data.content !== newPost.content) throw new Error('Post content mismatch');

      console.log(`   📝 Created post with ID: ${response.data.id}`);
    });

    await this.test('7. List Posts Verification', async () => {
      const response = await axios.get(`${this.baseUrl}/api/posts`);
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.posts) throw new Error('No posts array in response');
      if (!Array.isArray(response.data.posts)) throw new Error('Posts is not an array');
      if (response.data.posts.length === 0) throw new Error('No posts found');

      console.log(`   📚 Found ${response.data.posts.length} posts`);
    });

    await this.test('8. Invalid Credentials Test', async () => {
      const client = axios.create({ validateStatus: () => true });
      
      const response = await client.post(`${this.baseUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'wrongpassword'
      });
      
      if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
      if (response.data.code !== 'INVALID_CREDENTIALS') throw new Error('Expected INVALID_CREDENTIALS error code');
      
      console.log(`   🔒 Correctly rejected invalid credentials`);
    });

    await this.test('9. Validation Error Test', async () => {
      const cookieJar = new CookieJar();
      const client = wrapper(axios.create({
        jar: cookieJar,
        withCredentials: true,
        validateStatus: () => true
      }));

      // Login first
      await client.post(`${this.baseUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });

      // Try to create post with missing required field
      const response = await client.post(`${this.baseUrl}/api/posts`, {
        title: 'Incomplete Post'
        // Missing content field
      });
      
      if (response.status !== 400) throw new Error(`Expected 400, got ${response.status}`);
      if (response.data.code !== 'VALIDATION_ERROR') throw new Error('Expected VALIDATION_ERROR error code');
      
      console.log(`   ⚠️ Correctly rejected invalid post data`);
    });

    await this.test('10. Full Multi-Step Workflow', async () => {
      const cookieJar = new CookieJar();
      const client = wrapper(axios.create({
        jar: cookieJar,
        withCredentials: true,
        validateStatus: () => true
      }));

      // Step 1: Login
      const loginResponse = await client.post(`${this.baseUrl}/api/auth/login`, {
        email: 'demo@aura.dev',
        password: 'password123'
      });
      if (loginResponse.status !== 200) throw new Error(`Login failed: ${loginResponse.status}`);

      // Step 2: Create post
      const postData = {
        title: `E2E Workflow Test ${Date.now()}`,
        content: 'This post validates the complete AURA workflow.',
        tags: ['e2e', 'workflow', 'test'],
        published: true
      };

      const createResponse = await client.post(`${this.baseUrl}/api/posts`, postData);
      if (createResponse.status !== 201) {
        throw new Error(`Create post failed: ${createResponse.status}`);
      }

      const postId = createResponse.data.id;

      // Step 3: Read the created post
      const readResponse = await client.get(`${this.baseUrl}/api/posts/${postId}`);
      if (readResponse.status !== 200) throw new Error(`Read post failed: ${readResponse.status}`);
      if (readResponse.data.title !== postData.title) throw new Error('Read post title mismatch');

      // Step 4: List posts and verify our post exists
      const listResponse = await client.get(`${this.baseUrl}/api/posts`);
      if (listResponse.status !== 200) throw new Error(`List posts failed: ${listResponse.status}`);
      
      const ourPost = listResponse.data.posts.find((post: any) => post.id === postId);
      if (!ourPost) throw new Error('Created post not found in list');

      console.log(`   🔄 Complete workflow: Login → Create → Read → List - All successful!`);
    });
  }

  printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const total = this.results.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log('\n🔍 FAILED TESTS:');
      this.results.filter(r => !r.success).forEach(result => {
        console.log(`  • ${result.name}: ${result.error}`);
      });
    }
    
    console.log('\n' + (failed === 0 ? '🎉 ALL TESTS PASSED!' : '⚠️  SOME TESTS FAILED'));
    console.log('='.repeat(60));
  }
}

async function main() {
  const serverUrl = process.argv[2] || 'http://localhost:3000';
  
  console.log('🧪 AURA Protocol Comprehensive Test Suite');
  console.log(`🌐 Testing against: ${serverUrl}`);
  console.log('🔍 This will validate authentication, state management, and multi-step operations\n');
  
  const runner = new AuraTestRunner(serverUrl);
  await runner.runAllTests();
  runner.printSummary();
  
  // Exit with error code if tests failed
  const failed = runner['results'].filter((r: TestResult) => !r.success).length;
  process.exit(failed > 0 ? 1 : 0);
}

// Run the main function
main().catch(error => {
  console.error('❌ Test runner crashed:', error);
  process.exit(1);
}); 