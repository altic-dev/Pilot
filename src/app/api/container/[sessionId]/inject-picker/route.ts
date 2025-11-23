/**
 * Inject Picker API Endpoint
 *
 * Checks if the React component picker is supported for the given session
 * and returns picker configuration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/lib/session-store';
import { PickerInjector } from '@/lib/picker-injector';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Get session info
    const session = sessionStore.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        {
          supported: false,
          reason: 'Session not found',
        },
        { status: 404 }
      );
    }

    if (!session.containerId) {
      return NextResponse.json(
        {
          supported: false,
          reason: 'Container not available',
        },
        { status: 400 }
      );
    }

    // Check if picker is supported
    // Note: Pass sessionId, not containerId - execCommand uses sessionId to lookup container
    const result = await PickerInjector.isPickerSupported(
      sessionId,
      3000 // Internal container port
    );

    if (result.supported) {
      return NextResponse.json({
        supported: true,
        message: 'React component picker is available',
        details: result.details,
        config: PickerInjector.getPostMessageConfig(),
      });
    } else {
      return NextResponse.json({
        supported: false,
        reason: result.reason || 'Picker not supported',
        details: result.details,
      });
    }
  } catch (error) {
    console.error('[Inject Picker API] Error:', error);
    return NextResponse.json(
      {
        supported: false,
        reason: 'Internal server error',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Get the picker injection script
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Get session info
    const session = sessionStore.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { inline = false } = body;

    let script: string;

    if (inline) {
      // Return the inline script content
      script = await PickerInjector.getInlinePickerScript();
    } else {
      // Return the injection script tag
      const baseUrl = new URL(request.url).origin;
      script = PickerInjector.getInjectionScript(baseUrl);
    }

    return NextResponse.json({
      script,
      inline,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Inject Picker API] Error generating script:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate picker script',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
