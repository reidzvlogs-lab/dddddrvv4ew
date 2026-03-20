import express from 'express';
import { createServer as createViteServer } from 'vite';
import session from 'express-session';
import { google } from 'googleapis';
import path from 'path';

const app = express();
const PORT = 3000;

// Set up session to store OAuth tokens securely
app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret-school-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: 'none',
    httpOnly: true,
  }
}));

const getRedirectUri = (req: express.Request) => {
  // Use the APP_URL injected by the environment
  return `${process.env.APP_URL}/auth/callback`;
};

const getPowerSchoolRedirectUri = (req: express.Request) => {
  return `${process.env.APP_URL}/auth/powerschool/callback`;
};

// --- Google Classroom OAuth ---

// 1. Generate the Google OAuth URL
app.get('/api/auth/url', (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(req)
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/classroom.courses.readonly',
      'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
      'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly'
    ],
    prompt: 'consent'
  });

  res.json({ url });
});

// 2. Handle the Google OAuth callback
app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const code = req.query.code as string;
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri(req)
    );
    
    const { tokens } = await oauth2Client.getToken(code);
    
    // Save tokens in the session
    (req.session as any).tokens = tokens;
    (req.session as any).provider = 'google';
    
    // Close the popup and notify the main window
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth Error:', error);
    res.status(500).send('Authentication failed');
  }
});

// 3. Fetch grades from Google Classroom API
app.get('/api/grades', async (req, res) => {
  const tokens = (req.session as any).tokens;
  const provider = (req.session as any).provider;
  
  if (!tokens || provider !== 'google') {
    return res.status(401).json({ error: 'Not authenticated with Google Classroom' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials(tokens);

    const classroom = google.classroom({ version: 'v1', auth: oauth2Client });
    
    // Fetch active courses
    const coursesRes = await classroom.courses.list({ studentId: 'me', courseStates: ['ACTIVE'] });
    const courses = coursesRes.data.courses || [];

    // Fetch recent submissions for the first few courses
    const gradesData = await Promise.all(courses.slice(0, 5).map(async (course) => {
      try {
        const submissionsRes = await classroom.courses.courseWork.studentSubmissions.list({
          courseId: course.id!,
          courseWorkId: '-',
          userId: 'me',
          pageSize: 5
        });
        return {
          id: course.id,
          name: course.name,
          submissions: submissionsRes.data.studentSubmissions || []
        };
      } catch (e) {
        return {
          id: course.id,
          name: course.name,
          submissions: []
        };
      }
    }));

    res.json({ courses: gradesData });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch grades' });
  }
});

// --- PowerSchool OAuth ---

app.get('/api/auth/powerschool/url', (req, res) => {
  const domain = req.query.domain as string;
  if (!domain) {
    return res.status(400).json({ error: 'PowerSchool domain is required' });
  }
  
  // Store domain in session for the callback
  (req.session as any).psDomain = domain;

  const clientId = process.env.POWERSCHOOL_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'POWERSCHOOL_CLIENT_ID is not configured on the server.' });
  }

  const redirectUri = getPowerSchoolRedirectUri(req);
  
  // PowerSchool standard OAuth2 authorization URL
  const url = `https://${domain}/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;
  
  res.json({ url });
});

app.get(['/auth/powerschool/callback', '/auth/powerschool/callback/'], async (req, res) => {
  const code = req.query.code as string;
  const domain = (req.session as any).psDomain;
  
  if (!domain) {
    return res.status(400).send('Session expired. Please try again.');
  }

  try {
    const clientId = process.env.POWERSCHOOL_CLIENT_ID!;
    const clientSecret = process.env.POWERSCHOOL_CLIENT_SECRET!;
    const redirectUri = getPowerSchoolRedirectUri(req);

    // PowerSchool expects Basic Auth for the token endpoint
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenResponse = await fetch(`https://${domain}/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(`PowerSchool token error: ${tokenResponse.statusText}`);
    }

    const tokens = await tokenResponse.json();
    
    // Save tokens in the session
    (req.session as any).psTokens = tokens;
    (req.session as any).provider = 'powerschool';
    
    // Close the popup and notify the main window
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>PowerSchool Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('PowerSchool OAuth Error:', error);
    res.status(500).send('PowerSchool Authentication failed');
  }
});

app.get('/api/grades/powerschool', async (req, res) => {
  const tokens = (req.session as any).psTokens;
  const domain = (req.session as any).psDomain;
  const provider = (req.session as any).provider;
  
  if (!tokens || provider !== 'powerschool') {
    return res.status(401).json({ error: 'Not authenticated with PowerSchool' });
  }

  try {
    // Example call to PowerSchool API to get student grades
    // Note: The exact endpoint depends on the district's PowerSchool API version and plugin scopes.
    // This uses the standard PowerSchool Student API endpoint for sections/grades.
    const gradesResponse = await fetch(`https://${domain}/ws/v1/student/sections`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Accept': 'application/json'
      }
    });

    if (!gradesResponse.ok) {
      throw new Error(`PowerSchool API error: ${gradesResponse.statusText}`);
    }

    const data = await gradesResponse.json();
    
    // Map PowerSchool data to our app's format
    // This is a generic mapping, actual PowerSchool JSON structure varies heavily by district plugin
    const courses = (data.sections || []).map((section: any) => ({
      id: section.id,
      name: section.courseName || section.expression,
      submissions: [
        {
          id: 'current_grade',
          courseWorkId: 'Current Term Grade',
          assignedGrade: section.currentGrade || 'N/A'
        }
      ]
    }));

    res.json({ courses });
  } catch (error) {
    console.error('PowerSchool API Error:', error);
    res.status(500).json({ error: 'Failed to fetch PowerSchool grades' });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
