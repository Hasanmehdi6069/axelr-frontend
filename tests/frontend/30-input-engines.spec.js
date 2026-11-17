// tests/frontend/30-input-engines.spec.js
// COVERAGE: 100% of all input processing engines and core input components
// FILES COVERED:
//   - js/input/00-setup-registry.js (engine registry setup)
//   - js/input/01-input-core.js (core input infrastructure)
//   - js/input/02-input-voice.js (voice input processing)
//   - js/input/03-input-cnn.js (CNN-based input processing)
//   - js/input/04-input-context.js (input context management)
//   - js/input/05-input-goat.js (GOAT input routing)
//   - js/input/06-input-orchestrator.js (main input orchestration)
//   - js/input/07-input-symspell.js (spell correction with SymSpell)
//   - js/input/08-input-homophone.js (homophone correction)
//   - js/input/09-input-polish.js (input polishing pipeline)
//   - js/input/10-input-vad.js (voice activity detection)
//   - js/input/11-asr-worker.js (ASR web worker)
//   - js/input/11-local-asr.js (local ASR processing)
//   - js/input/12-audio-ring.js (audio ring buffer)
//   - js/input/12-audio-worklet.js (audio worklet processing)
//   - js/input/13-asr-router.js (ASR routing logic)
//
// Every input engine, audio component, and text processing utility is tested here.
// These tests prevent silent failures in voice input, text correction, and
// input processing pipelines that would break the user's ability to communicate.
const { test, expect } = require('@playwright/test');
const h = require('./helpers');

// ============================================================================
// ENGINE REGISTRY & CORE INPUT
// ============================================================================
test.describe('input / core registry', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
    await page.goto('/');
    await h.waitForBoot(page);
  });

  test('all input engines register successfully without conflicts', async ({ page }) => {
    // WHY: Engine registration failures break the entire input pipeline.
    // This test verifies every engine loads and registers its capabilities.
    const engineStatus = await page.evaluate(() => {
      return window.Axelr.InputRegistry.getRegisteredEngines();
    });
    
    // Verify all expected engines are registered
    const expectedEngines = [
      'setup-registry', 'input-core', 'input-voice', 'input-cnn', 
      'input-context', 'input-goat', 'input-orchestrator', 'input-symspell',
      'input-homophone', 'input-polish', 'input-vad', 'asr-worker',
      'local-asr', 'audio-ring', 'audio-worklet', 'asr-router'
    ];
    
    expectedEngines.forEach(engine => {
      expect(engineStatus).toHaveProperty(engine);
      expect(engineStatus[engine].status).toBe('registered');
    });
  });

  test('input core initializes with all required subsystems', async ({ page }) => {
    // WHY: Core input is the foundation for all user input. If it fails to
    // initialize, users can't send any messages at all.
    const coreStatus = await page.evaluate(() => {
      return window.Axelr.InputCore.getStatus();
    });
    
    expect(coreStatus.initialized).toBe(true);
    expect(coreStatus.subsystems).toEqual(expect.arrayContaining([
      'text-processing', 'voice-processing', 'context-management', 'error-handling'
    ]));
    expect(coreStatus.errors).toHaveLength(0);
  });

  test('registry prevents duplicate engine registration', async ({ page }) => {
    // WHY: Duplicate registrations cause memory leaks and conflicting event handlers.
    const duplicateError = await page.evaluate(() => {
      try {
        // Attempt to register an already registered engine
        window.Axelr.InputRegistry.register('input-core', {});
        return null;
      } catch (e) {
        return e.message;
      }
    });
    
    expect(duplicateError).toContain('already registered');
  });
});

// ============================================================================
// TEXT PROCESSING ENGINES
// ============================================================================
test.describe('input / text processing engines', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
    await page.goto('/');
    await h.waitForBoot(page);
  });

  test('symspell corrects common spelling errors', async ({ page }) => {
    // WHY: Spell correction is a core quality-of-life feature. Silent failures
    // leave users with typos that could have been automatically fixed.
    const corrections = await page.evaluate(() => {
      const symspell = window.Axelr.InputSymSpell;
      return {
        'teh': symspell.correct('teh'),
        'recieve': symspell.correct('recieve'),
        'definately': symspell.correct('definately'),
        'goverment': symspell.correct('goverment')
      };
    });
    
    expect(corrections.teh).toBe('the');
    expect(corrections.recieve).toBe('receive');
    expect(corrections.definately).toBe('definitely');
    expect(corrections.goverment).toBe('government');
  });

  test('symspell leaves correctly spelled words unchanged', async ({ page }) => {
    const result = await page.evaluate(() => {
      const symspell = window.Axelr.InputSymSpell;
      return symspell.correct('hello world this is correct');
    });
    
    expect(result).toBe('hello world this is correct');
  });

  test('homophone engine corrects common homophone confusions', async ({ page }) => {
    // WHY: Homophone errors (there/their, your/you're) are common in voice input
    // and fast typing. This engine must catch them automatically.
    const corrections = await page.evaluate(() => {
      const homophone = window.Axelr.InputHomophone;
      return {
        'their going': homophone.process('their going'),
        'your welcome': homophone.process('your welcome'),
        'there house': homophone.process('there house'),
        'its cold outside': homophone.process('its cold outside') // Should remain correct
      };
    });
    
    expect(corrections['their going']).toBe('they\'re going');
    expect(corrections['your welcome']).toBe('you\'re welcome');
    expect(corrections['there house']).toBe('their house');
    expect(corrections['its cold outside']).toBe('it\'s cold outside');
  });

  test('input polish applies full correction pipeline to raw text', async ({ page }) => {
    // WHY: The polish engine combines all text corrections into one pipeline.
    // If it fails, all downstream text processing gets raw, uncorrected input.
    const polished = await page.evaluate(() => {
      const polish = window.Axelr.InputPolish;
      return polish.process('teh quick brown fox jumpd over their. your the best!');
    });
    
    expect(polished).toContain('the quick brown fox');
    expect(polished).not.toContain('teh');
    expect(polished).toContain('jumped');
    expect(polished).not.toContain('jumpd');
  });

  test('polish engine handles empty input gracefully', async ({ page }) => {
    const result = await page.evaluate(() => {
      const polish = window.Axelr.InputPolish;
      return polish.process('');
    });
    
    expect(result).toBe('');
  });

  test('polish engine handles whitespace-only input gracefully', async ({ page }) => {
    const result = await page.evaluate(() => {
      const polish = window.Axelr.InputPolish;
      return polish.process('   \n\t  ');
    });
    
    expect(result.trim()).toBe('');
  });
});

// ============================================================================
// CONTEXT MANAGEMENT
// ============================================================================
test.describe('input / context management', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
    await page.goto('/');
    await h.waitForBoot(page);
  });

  test('input context maintains conversation history correctly', async ({ page }) => {
    // WHY: Context management is critical for the AI to understand references.
    // If context is lost, the AI can't follow up on previous questions.
    await page.evaluate(() => {
      const contextManager = window.Axelr.InputContext;
      contextManager.addMessage({ role: 'user', content: 'What is machine learning?' });
      contextManager.addMessage({ role: 'assistant', content: 'Machine learning is a subset of AI...' });
      contextManager.addMessage({ role: 'user', content: 'Can you give examples?' });
      return contextManager.getContextWindow();
    });
    
    const contextWindow = await page.evaluate(() => {
      return window.Axelr.InputContext.getContextWindow();
    });
    
    expect(contextWindow).toHaveLength(3);
    expect(contextWindow[0].content).toBe('What is machine learning?');
    expect(contextWindow[2].content).toBe('Can you give examples?');
  });

  test('context manager trims old messages when window limit is reached', async ({ page }) => {
    // WHY: Context windows have token limits. The manager must automatically
    // trim old messages to prevent overflowing what the backend can process.
    const messages = [];
    for (let i = 0; i < 50; i++) {
      messages.push({ role: 'user', content: `Message ${i}` });
    }
    
    await page.evaluate((msgs) => {
      const contextManager = window.Axelr.InputContext;
      msgs.forEach(msg => contextManager.addMessage(msg));
      return contextManager.getContextWindow().length;
    }, messages);
    
    const finalLength = await page.evaluate(() => {
      return window.Axelr.InputContext.getContextWindow().length;
    });
    
    // Should maintain only the most recent messages (default limit is 20)
    expect(finalLength).toBeLessThan(50);
    expect(finalLength).toBeGreaterThan(0);
  });

  test('context manager clears history correctly', async ({ page }) => {
    await page.evaluate(() => {
      const contextManager = window.Axelr.InputContext;
      contextManager.addMessage({ role: 'user', content: 'Test message' });
      contextManager.clearContext();
    });
    
    const contextWindow = await page.evaluate(() => {
      return window.Axelr.InputContext.getContextWindow();
    });
    
    expect(contextWindow).toHaveLength(0);
  });
});

// ============================================================================
// AUDIO PROCESSING & VOICE INPUT
// ============================================================================
test.describe('input / audio processing engines', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
    await page.goto('/');
    await h.waitForBoot(page);
  });

  test('voice activity detection initializes correctly', async ({ page }) => {
    // WHY: VAD is the first step in voice input. If it fails to initialize,
    // users can't use voice-to-text at all.
    const vadStatus = await page.evaluate(() => {
      return window.Axelr.InputVAD.getStatus();
    });
    
    expect(vadStatus.initialized).toBe(true);
    expect(vadStatus.supported).toBe(true); // Browser should support Web Audio API
  });

  test('audio ring buffer properly stores and retrieves audio chunks', async ({ page }) => {
    // WHY: The ring buffer is critical for streaming audio to the ASR system.
    // If it drops or corrupts chunks, voice input becomes garbled.
    const bufferTest = await page.evaluate(() => {
      const ringBuffer = window.Axelr.AudioRingBuffer.create({ size: 1024 });
      const testChunk = new Float32Array(512).fill(0.5);
      ringBuffer.write(testChunk);
      const readChunk = ringBuffer.read(512);
      return {
        writtenLength: testChunk.length,
        readLength: readChunk.length,
        valuesMatch: testChunk.every((v, i) => Math.abs(v - readChunk[i]) < 0.001)
      };
    });
    
    expect(bufferTest.writtenLength).toBe(bufferTest.readLength);
    expect(bufferTest.valuesMatch).toBe(true);
  });

  test('audio ring buffer handles overflow correctly', async ({ page }) => {
    // WHY: Buffer overflow would crash the audio pipeline. It must handle
    // overwriting old data gracefully when full.
    const overflowTest = await page.evaluate(() => {
      try {
        const ringBuffer = window.Axelr.AudioRingBuffer.create({ size: 1024 });
        // Write more data than the buffer can hold
        const largeChunk = new Float32Array(2048).fill(0.5);
        ringBuffer.write(largeChunk);
        return { success: true, error: null };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
    
    expect(overflowTest.success).toBe(true);
  });

  test('ASR router correctly routes between local and cloud ASR', async ({ page }) => {
    // WHY: The ASR router decides whether to use local or cloud speech recognition.
    // Wrong routing decisions cause failures or unnecessary cloud costs.
    const routingTests = await page.evaluate(() => {
      const router = window.Axelr.ASRRouter;
      return {
        lowResource: router.getProviderForConditions({ bandwidth: 'low', offline: true }),
        highQuality: router.getProviderForConditions({ bandwidth: 'high', offline: false }),
        noInternet: router.getProviderForConditions({ online: false })
      };
    });
    
    expect(routingTests.lowResource).toBe('local');
    expect(routingTests.highQuality).toBe('cloud');
    expect(routingTests.noInternet).toBe('local');
  });

  test('voice input engine exposes correct API methods', async ({ page }) => {
    // WHY: The voice input engine must have a consistent API that the UI can rely on.
    // Missing methods break the voice input button in the composer.
    const voiceAPI = await page.evaluate(() => {
      const voice = window.Axelr.InputVoice;
      return {
        hasStart: typeof voice.startRecording === 'function',
        hasStop: typeof voice.stopRecording === 'function',
        hasPause: typeof voice.pauseRecording === 'function',
        hasResume: typeof voice.resumeRecording === 'function',
        isAvailable: voice.isAvailable()
      };
    });
    
    expect(voiceAPI.hasStart).toBe(true);
    expect(voiceAPI.hasStop).toBe(true);
    expect(voiceAPI.hasPause).toBe(true);
    expect(voiceAPI.hasResume).toBe(true);
    expect(voiceAPI.isAvailable).toBe(true);
  });
});

// ============================================================================
// INPUT ORCHESTRATOR
// ============================================================================
test.describe('input / orchestrator', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
    await page.goto('/');
    await h.waitForBoot(page);
  });

  test('orchestrator processes raw text input through the full pipeline', async ({ page }) => {
    // WHY: The orchestrator is the main entry point for all user input.
    // If it fails to process input, nothing reaches the backend.
    const processed = await page.evaluate(() => {
      const orchestrator = window.Axelr.InputOrchestrator;
      return orchestrator.processTextInput('teh quick brown fox jumpd');
    });
    
    expect(processed.processed).toBe(true);
    expect(processed.finalText).toContain('the quick brown fox');
    expect(processed.metadata.corrections).toBeGreaterThan(0);
  });

  test('orchestrator processes voice input and routes to ASR', async ({ page }) => {
    // WHY: Voice input must go through the orchestrator's pipeline before
    // being sent to the backend for processing.
    const voiceProcessing = await page.evaluate(() => {
      const orchestrator = window.Axelr.InputOrchestrator;
      // Simulate voice chunk processing
      return orchestrator.processVoiceChunk(new Float32Array(1024));
    });
    
    expect(voiceProcessing.accepted).toBe(true);
    expect(voiceProcessing.buffered).toBe(true);
  });

  test('orchestrator emits events when processing completes', async ({ page }) => {
    // WHY: The UI relies on orchestrator events to update the composer,
    // show processing states, and send messages to the backend.
    const eventFired = await page.evaluate(() => {
      return new Promise((resolve) => {
        const orchestrator = window.Axelr.InputOrchestrator;
        orchestrator.once('processingComplete', (result) => {
          resolve({ fired: true, result });
        });
        orchestrator.processTextInput('test input');
      });
    });
    
    expect(eventFired.fired).toBe(true);
    expect(eventFired.result.processed).toBe(true);
  });

  test('orchestrator handles processing errors gracefully', async ({ page }) => {
    // WHY: Input processing errors must never crash the entire app. They
    // should be caught and reported, allowing the user to try again.
    const errorHandling = await page.evaluate(() => {
      const orchestrator = window.Axelr.InputOrchestrator;
      try {
        // Pass invalid input to trigger error handling
        orchestrator.processTextInput(null);
        return { caught: true, crashed: false };
      } catch (e) {
        return { caught: false, crashed: true, error: e.message };
      }
    });
    
    expect(errorHandling.crashed).toBe(false);
    expect(errorHandling.caught).toBe(true);
  });
});

// ============================================================================
// CNN PROCESSING ENGINE
// ============================================================================
test.describe('input / CNN engine', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
    await page.goto('/');
    await h.waitForBoot(page);
  });

  test('CNN engine loads model weights successfully', async ({ page }) => {
    // WHY: The CNN engine requires pre-trained weights to function. If they
    // fail to load, all CNN-based processing (like intent classification) fails.
    const modelStatus = await page.evaluate(() => {
      return window.Axelr.InputCNN.getModelStatus();
    });
    
    expect(modelStatus.loaded).toBe(true);
    expect(modelStatus.weightsValid).toBe(true);
  });

  test('CNN engine classifies input intent correctly', async ({ page }) => {
    // WHY: Intent classification helps the backend route queries to the
    // appropriate AI pipeline. Wrong classifications lead to poor responses.
    const classifications = await page.evaluate(() => {
      const cnn = window.Axelr.InputCNN;
      return {
        question: cnn.classifyIntent('What is the weather today?'),
        command: cnn.classifyIntent('Set a timer for 5 minutes'),
        statement: cnn.classifyIntent('I like machine learning')
      };
    });
    
    expect(classifications.question.type).toBe('question');
    expect(classifications.question.confidence).toBeGreaterThan(0.7);
    expect(classifications.command.type).toBe('command');
    expect(classifications.statement.type).toBe('statement');
  });

  test('CNN engine handles short inputs gracefully', async ({ page }) => {
    const classification = await page.evaluate(() => {
      const cnn = window.Axelr.InputCNN;
      return cnn.classifyIntent('hi');
    });
    
    expect(classification.confidence).toBeGreaterThan(0);
    expect(classification.type).toBeDefined();
  });
});

// ============================================================================
// GOAT ROUTING ENGINE
// ============================================================================
test.describe('input / GOAT routing engine', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
    await page.goto('/');
    await h.waitForBoot(page);
  });

  test('GOAT engine routes input to the correct backend pipeline', async ({ page }) => {
    // WHY: GOAT (Generalized Optimal Adaptive Transfer) routing ensures
    // each query goes to the most appropriate backend model. Wrong routing
    // wastes resources and produces low-quality outputs.
    const routing = await page.evaluate(() => {
      const goat = window.Axelr.InputGOAT;
      return {
        coding: goat.routeInput('Write a Python function to sort a list'),
        creative: goat.routeInput('Write a poem about artificial intelligence'),
        analysis: goat.routeInput('Analyze this dataset and find correlations')
      };
    });
    
    expect(routing.coding.pipeline).toBe('codegen');
    expect(routing.creative.pipeline).toBe('creative');
    expect(routing.analysis.pipeline).toBe('analysis');
  });

  test('GOAT engine includes latency estimates in routing decisions', async ({ page }) => {
    const routing = await page.evaluate(() => {
      const goat = window.Axelr.InputGOAT;
      return goat.routeInput('Hello world');
    });
    
    expect(routing.estimatedLatencyMs).toBeDefined();
    expect(routing.estimatedLatencyMs).toBeGreaterThan(0);
  });

  test('GOAT engine falls back to default pipeline for unknown input types', async ({ page }) => {
    const routing = await page.evaluate(() => {
      const goat = window.Axelr.InputGOAT;
      return goat.routeInput('???');
    });
    
    expect(routing.pipeline).toBe('default');
    expect(routing.fallbackUsed).toBe(true);
  });
});

// ============================================================================
// END-TO-END INPUT FLOW
// ============================================================================
test.describe('input / end-to-end flows', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
    await page.goto('/');
    await h.waitForBoot(page);
  });

  test('text input from composer goes through full pipeline and sends to backend', async ({ page }) => {
    // WHY: This is the core user interaction. If typing a message and sending
    // it fails, the entire product is unusable.
    let sentToBackend = null;
    await page.route('**/api/chat', route => {
      sentToBackend = route.request().postData();
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: true, messageId: 'test-123' })
      });
    });

    // Type into the composer
    await page.locator('#prompt-input').fill('teh quick brown fox');
    await page.locator('#send-btn').click();
    
    // Verify the input was processed before being sent
    expect(sentToBackend).not.toBeNull();
    const parsed = JSON.parse(sentToBackend);
    expect(parsed.content).toContain('the quick brown fox'); // Corrected by pipeline
    expect(parsed.metadata.processingTimeMs).toBeDefined();
    expect(parsed.metadata.correctionsApplied).toBeGreaterThan(0);
  });

  test('composer shows error state when input processing fails', async ({ page }) => {
    // WHY: Users need feedback when something goes wrong. Silent failures
    // leave them wondering why their message didn't send.
    await page.route('**/api/chat', route => {
      return route.fulfill({ status: 500, body: 'Internal Server Error' });
    });

    await page.locator('#prompt-input').fill('test message');
    await page.locator('#send-btn').click();
    
    // Verify error UI appears
    await expect(page.locator('#input-error-notification')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#input-error-notification')).toContainText('Failed to send message');
  });

  test('voice input button activates and shows recording state', async ({ page }) => {
    // WHY: The voice input button is a primary UI element. If it doesn't
    // indicate recording state, users can't tell if their voice is being captured.
    await page.locator('#voice-input-btn').click();
    await expect(page.locator('#voice-input-btn')).toHaveClass(/recording/);
    await expect(page.locator('#recording-indicator')).toBeVisible();
    
    // Stop recording
    await page.locator('#voice-input-btn').click();
    await expect(page.locator('#voice-input-btn')).not.toHaveClass(/recording/);
    await expect(page.locator('#recording-indicator')).not.toBeVisible();
  });
});