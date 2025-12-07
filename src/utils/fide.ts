export interface FidePlayer {
  fideId: string;
  name: string;
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  title?: string;
  rating?: number;
  federation?: string;
  standardRating?: number;
  rapidRating?: number;
  blitzRating?: number;
  worldRank?: number;
  nationalRank?: number;
  photo?: string;
  birthYear?: number;
  age?: number;
}

/**
 * Searches for FIDE player information by ID using scraping
 * Extracts data from ratings.fide.com/profile/{fideId}
 */
export async function fetchFidePlayer(fideId: string): Promise<FidePlayer | null> {
  console.log("fetchFidePlayer called with ID:", fideId);
  try {
    // Use Tauri command to fetch HTML from backend (no CORS restrictions)
    const { invoke } = await import("@tauri-apps/api/core");
    console.log("Fetching FIDE profile HTML via Tauri command...");
    
    let html: string;
    try {
      html = await invoke<string>("fetch_fide_profile_html", { fideId: fideId });
      console.log("Fetched HTML successfully via Tauri, length:", html.length);
    } catch (error) {
      console.error("Failed to fetch FIDE profile via Tauri:", error);
      return null;
    }

    // Check if the page indicates that the player does not exist
    // FIDE can show different error messages
    const htmlLower = html.toLowerCase();
    const has404 = htmlLower.includes("404");
    const hasNotFound = htmlLower.includes("not found") || htmlLower.includes("player not found") || htmlLower.includes("page not found");
    const hasError = htmlLower.includes("error") && htmlLower.includes("profile");
    
    console.log("Checking for error indicators:", { has404, hasNotFound, hasError });
    
    // Only return null if there are clear error indicators AND no useful content
    // Sometimes FIDE shows "404" in the HTML but the profile exists
    if ((has404 || hasNotFound || hasError) && html.length < 10000) {
      console.log("FIDE profile not found for ID:", fideId, "HTML too short:", html.length);
      return null;
    }
    
    console.log("HTML looks valid, proceeding to parse. Length:", html.length);

    // Parse the HTML using DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Extract full name - search in multiple common FIDE selectors
    let fullName = "";
    const nameSelectors = [
      ".profile-top-title",
      "h1.profile-top-title",
      ".player-name",
      "h1",
      ".profile-header-title",
      "[class*='player'] [class*='name']",
    ];

    for (const selector of nameSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        fullName = element.textContent?.trim() || "";
        if (fullName && fullName.length > 2) break;
      }
    }

    // If we don't find a name, search in the page title
    if (!fullName || fullName.length < 2) {
      const titleElement = doc.querySelector("title");
      const titleText = titleElement?.textContent?.trim() || "";
      // The title is usually "Name - FIDE Ratings"
      const titleMatch = titleText.match(/^([^-]+)/);
      if (titleMatch) {
        fullName = titleMatch[1].trim();
      }
    }

    // If we still don't have a name, try extracting from the page title once more
    if (!fullName || fullName.length < 2) {
      console.log("Name not found in selectors, trying title again...");
      const titleElement = doc.querySelector("title");
      const titleText = titleElement?.textContent?.trim() || "";
      console.log("Title text:", titleText);
      
      // The title can be "Name - FIDE Profile" or "Name FIDE Profile"
      const titleMatch = titleText.match(/^([^-]+)/) || titleText.match(/^(.+?)\s+FIDE/i);
      if (titleMatch) {
        fullName = titleMatch[1].trim();
        console.log("Extracted name from title:", fullName);
      }
    }
    
    // If we still don't have a name after all attempts, return null
    if (!fullName || fullName.length < 2) {
      console.log("Could not extract name from HTML. HTML snippet:", html.substring(0, 500));
      return null;
    }
    
    console.log("Extracted name:", fullName);

    // Clean the name (remove titles, extra spaces, etc.)
    fullName = fullName.replace(/\s+/g, " ").trim();

    // Dividir nombre en partes
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Extract title (GM, IM, FM, etc.) from the name or HTML
    let title: string | undefined;
    
    // Map to convert full names to abbreviations
    const titleMap: Record<string, string> = {
      "GRANDMASTER": "GM",
      "INTERNATIONAL MASTER": "IM",
      "FIDE MASTER": "FM",
      "CANDIDATE MASTER": "CM",
      "WOMAN GRANDMASTER": "WGM",
      "WOMAN INTERNATIONAL MASTER": "WIM",
      "WOMAN FIDE MASTER": "WFM",
      "WOMAN CANDIDATE MASTER": "WCM",
      "NATIONAL MASTER": "NM",
      "WOMAN NATIONAL MASTER": "WNM",
      "MASTER": "FM", // "FIDE Master" is abbreviated as FM
    };
    
    // First try to extract from the name
    const titleMatch = fullName.match(/\b(GM|IM|FM|WGM|WIM|WFM|CM|WCM|NM|WNM)\b/i);
    if (titleMatch) {
      title = titleMatch[1].toUpperCase();
      // Remove the title from the full name to clean it
      fullName = fullName.replace(/\b(GM|IM|FM|WGM|WIM|WFM|CM|WCM|NM|WNM)\b/gi, "").trim();
      console.log("Title extracted from name:", title);
    }
    
    // If not found in the name, search in the HTML
    if (!title) {
      // Search for "FIDE title" or "FIDE Master" in the HTML
      // FIDE can show: "FIDE title: FIDE Master" or "FIDE Master" or "Title: FM"
      const titlePatterns = [
        // Patterns for "FIDE Master", "FIDE title: FIDE Master", etc.
        /FIDE\s+title[:\s]+(?:FIDE\s+)?(Master|Grandmaster|International\s+Master|Candidate\s+Master|Woman\s+Grandmaster|Woman\s+International\s+Master|Woman\s+FIDE\s+Master|Woman\s+Candidate\s+Master|National\s+Master|Woman\s+National\s+Master)/i,
        /FIDE\s+(Master|Grandmaster|International\s+Master|Candidate\s+Master|Woman\s+Grandmaster|Woman\s+International\s+Master|Woman\s+FIDE\s+Master|Woman\s+Candidate\s+Master|National\s+Master|Woman\s+National\s+Master)/i,
        // Patterns for direct abbreviations
        /(?:Title|FIDE\s+title)[:\s]+([A-Z]{2,3})\b/i,
        /\btitle[:\s]+([A-Z]{2,3})\b/i,
        // Search in HTML elements with related attributes or classes
        /<[^>]*(?:class|id|data-title)[^>]*title[^>]*>([A-Z]{2,3})<\/[^>]*>/i,
        /<[^>]*title[^>]*>([A-Z]{2,3})<\/[^>]*>/i,
        // Search in tables or divs
        /<td[^>]*>.*?title.*?<\/td>\s*<td[^>]*>([A-Z]{2,3})<\/td>/i,
        /<div[^>]*>.*?title.*?<\/div>\s*<div[^>]*>([A-Z]{2,3})<\/div>/i,
      ];
      
      for (const pattern of titlePatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          let potentialTitle = match[1].trim().toUpperCase();
          
          // If it's a full name, convert it
          if (titleMap[potentialTitle]) {
            potentialTitle = titleMap[potentialTitle];
          }
          
          // Verify that it's a valid title
          if (/^(GM|IM|FM|WGM|WIM|WFM|CM|WCM|NM|WNM)$/.test(potentialTitle)) {
            title = potentialTitle;
            console.log("Title extracted from HTML:", title, "from pattern:", pattern);
            break;
          }
        }
      }
      
      // If we still haven't found the title, search in FIDE-specific classes
      if (!title) {
        // FIDE uses <div class="profile-info-title"><p>FIDE Master</p></div>
        const titleDiv = doc.querySelector(".profile-info-title");
        if (titleDiv) {
          const titleP = titleDiv.querySelector("p");
          const titleText = titleP?.textContent?.trim() || "";
          console.log("Found .profile-info-title with text:", titleText);
          
          if (titleText) {
            // Search for full names
            const upperText = titleText.toUpperCase();
            for (const [fullName, abbrev] of Object.entries(titleMap)) {
              if (upperText.includes(fullName)) {
                title = abbrev;
                console.log("✓ Title extracted from .profile-info-title (full name):", title);
                break;
              }
            }
            
            // If not found, search for abbreviations
            if (!title) {
              const abbrevMatch = titleText.match(/\b(GM|IM|FM|WGM|WIM|WFM|CM|WCM|NM|WNM)\b/i);
              if (abbrevMatch) {
                title = abbrevMatch[1].toUpperCase();
                console.log("✓ Title extracted from .profile-info-title (abbrev):", title);
              }
            }
          }
        }
      }
      
      // If we still haven't found the title, search in DOM elements
      if (!title) {
        const titleElements = doc.querySelectorAll("[class*='title'], [id*='title'], [data-title]");
        for (const el of titleElements) {
          const text = el.textContent?.trim() || "";
          const abbrevMatch = text.match(/\b(GM|IM|FM|WGM|WIM|WFM|CM|WCM|NM|WNM)\b/i);
          if (abbrevMatch) {
            title = abbrevMatch[1].toUpperCase();
            console.log("Title extracted from DOM element:", title);
            break;
          }
          
          // Also search for full names
          for (const [fullName, abbrev] of Object.entries(titleMap)) {
            if (text.toUpperCase().includes(fullName)) {
              title = abbrev;
              console.log("Title extracted from DOM (full name):", title);
              break;
            }
          }
          if (title) break;
        }
      }
      
      // Last attempt: search in all table cells that contain "title" or "FIDE"
      if (!title) {
        const allCells = doc.querySelectorAll("td, th");
        for (let i = 0; i < allCells.length; i++) {
          const cell = allCells[i];
          const cellText = cell.textContent?.toLowerCase() || "";
          if (cellText.includes("title") || cellText.includes("fide")) {
            // Search in the same cell or the next one
            const currentText = cell.textContent || "";
            const nextCell = allCells[i + 1];
            const nextText = nextCell?.textContent || "";
            const combinedText = (currentText + " " + nextText).toUpperCase();
            
            // Search for abbreviations
            const abbrevMatch = combinedText.match(/\b(GM|IM|FM|WGM|WIM|WFM|CM|WCM|NM|WNM)\b/i);
            if (abbrevMatch) {
              title = abbrevMatch[1].toUpperCase();
              console.log("Title extracted from table cell:", title);
              break;
            }
            
            // Search for full names
            for (const [fullName, abbrev] of Object.entries(titleMap)) {
              if (combinedText.includes(fullName)) {
                title = abbrev;
                console.log("Title extracted from table cell (full name):", title);
                break;
              }
            }
            if (title) break;
          }
        }
      }
    }
    
    console.log("Final title:", title || "none");

    // Extract birth year and calculate age
    let birthYear: number | undefined;
    let age: number | undefined;
    
    // Search for birth date patterns in the HTML
    // FIDE uses <p class="profile-info-byear">1960</p>
    const byearElement = doc.querySelector(".profile-info-byear, p.profile-info-byear");
    if (byearElement) {
      const yearText = byearElement.textContent?.trim();
      if (yearText) {
        const year = parseInt(yearText, 10);
        if (year >= 1900 && year <= new Date().getFullYear()) {
          birthYear = year;
          age = new Date().getFullYear() - year;
          console.log("✓ Birth year extracted from profile-info-byear:", birthYear, "Age:", age);
        }
      }
    }
    
    // If not found, search with regex patterns
    if (!birthYear) {
      const birthYearPatterns = [
        /(?:B-Year|B\.Year|Birth\s+Year|Year\s+of\s+Birth|Born)[:\s]+(\d{4})/i,
        /\b(\d{4})\s*\((?:age|years)\)/i,
        /<[^>]*(?:birth|born)[^>]*>.*?(\d{4})/i,
      ];
    
      for (const pattern of birthYearPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          const year = parseInt(match[1], 10);
          if (year >= 1900 && year <= new Date().getFullYear()) {
            birthYear = year;
            age = new Date().getFullYear() - year;
            console.log("Birth year extracted from regex:", birthYear, "Age:", age);
            break;
          }
        }
      }
    }
    
    // If not found, search in the information table
    if (!birthYear) {
      const allCells = doc.querySelectorAll("td, th");
      for (let i = 0; i < allCells.length; i++) {
        const cell = allCells[i];
        const cellText = cell.textContent?.toLowerCase() || "";
        if (cellText.includes("year") || cellText.includes("birth") || cellText.includes("born")) {
          const nextCell = allCells[i + 1];
          if (nextCell) {
            const yearMatch = nextCell.textContent?.match(/\b(\d{4})\b/);
            if (yearMatch) {
              const year = parseInt(yearMatch[1], 10);
              if (year >= 1900 && year <= new Date().getFullYear()) {
                birthYear = year;
                age = new Date().getFullYear() - year;
                console.log("Birth year extracted from table:", birthYear, "Age:", age);
                break;
              }
            }
          }
        }
      }
    }

    // Extract gender - FIDE uses "M" or "F" in the HTML
    let gender: "male" | "female" = "male"; // Default
    
    console.log("Starting gender extraction for FIDE ID:", fideId);
    
    // Search for gender more specifically in the HTML
    // FIDE uses <p class="profile-info-sex">Male</p> or <p class="profile-info-sex">Female</p>
    // IMPORTANT: Search for "Female" first to avoid false positives
    
    let foundGender: "male" | "female" | null = null;
    
    // Method 1: Search using FIDE-specific class (most reliable)
    const genderElement = doc.querySelector(".profile-info-sex, p.profile-info-sex");
    if (genderElement) {
      const genderText = genderElement.textContent?.trim().toLowerCase() || "";
      console.log(`Found gender element with text: "${genderText}"`);
      if (genderText.includes("female") || genderText === "f") {
        foundGender = "female";
        console.log("✓ Gender detected as FEMALE from profile-info-sex element");
      } else if (genderText.includes("male") || genderText === "m") {
        foundGender = "male";
        console.log("✓ Gender detected as MALE from profile-info-sex element");
      }
    }
    
    // Method 2: Search in context of "Sex" or "Gender" with regex
    if (!foundGender) {
      const sexGenderPatterns = [
        /<p[^>]*class="profile-info-sex"[^>]*>\s*(Male|Female|M|F)\s*<\/p>/i,
        /Sex[:\s]*<[^>]+>\s*(Male|Female|M|F)\s*</i,
        /Gender[:\s]*<[^>]+>\s*(Male|Female|M|F)\s*</i,
        /\bSex[:\s]+(Male|Female|M|F)\b/i,
        /\bGender[:\s]+(Male|Female|M|F)\b/i,
        /<td[^>]*>.*?Sex.*?<\/td>\s*<td[^>]*>\s*(Male|Female|M|F)\s*<\/td>/i,
        /<td[^>]*>.*?Gender.*?<\/td>\s*<td[^>]*>\s*(Male|Female|M|F)\s*<\/td>/i,
      ];
      
      // Search for "Female" first to avoid false positives
      for (const pattern of sexGenderPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          const genderText = match[1].toLowerCase();
          if (genderText.includes("f") || genderText === "f") {
            foundGender = "female";
            console.log("✓ Gender detected as FEMALE from pattern:", pattern, "match:", match[0]);
            break;
          } else if (genderText.includes("m") || genderText === "m") {
            foundGender = "male";
            console.log("✓ Gender detected as MALE from pattern:", pattern, "match:", match[0]);
          }
        }
      }
    }
    
    // Method 3: If we don't find in specific patterns, search in elements with div.profile-info-row
    if (!foundGender) {
      console.log("No gender found in patterns, searching profile-info-row elements...");
      const infoRows = doc.querySelectorAll(".profile-info-row");
      console.log(`Found ${infoRows.length} profile-info-row elements`);
      
      for (const row of infoRows) {
        const h5 = row.querySelector("h5");
        const p = row.querySelector("p");
        
        if (h5 && p) {
          const labelText = h5.textContent?.toLowerCase() || "";
          const valueText = p.textContent?.trim().toLowerCase() || "";
          
          if (labelText.includes("gender") || labelText.includes("sex")) {
            console.log(`Found gender/sex in profile-info-row: label="${labelText}", value="${valueText}"`);
            
            if (valueText.includes("female") || valueText === "f") {
              foundGender = "female";
              console.log("✓ Gender detected as FEMALE from profile-info-row");
              break;
            } else if (valueText.includes("male") || valueText === "m") {
              foundGender = "male";
              console.log("✓ Gender detected as MALE from profile-info-row");
              break;
            }
          }
        }
      }
    }
    
    // Method 4: If we don't find, search in table cells
    if (!foundGender) {
      console.log("No gender found in profile-info-row, searching table cells...");
      const allCells = doc.querySelectorAll("td, th");
      console.log(`Found ${allCells.length} table cells`);
      
      for (let i = 0; i < allCells.length; i++) {
        const cell = allCells[i];
        const cellText = cell.textContent?.toLowerCase() || "";
        
        // Search for cells that mention "sex" or "gender"
        if (cellText.includes("sex") || cellText.includes("gender")) {
          console.log(`Found sex/gender cell at index ${i}:`, cellText);
          
          // Search in the same cell or the next one
          const currentText = cell.textContent?.trim().toLowerCase() || "";
          const nextCell = allCells[i + 1];
          const nextText = nextCell?.textContent?.trim().toLowerCase() || "";
          
          console.log(`  Current cell text: "${currentText}"`);
          console.log(`  Next cell text: "${nextText}"`);
          
          // Search for "female" or "f" first (more specific)
          if (currentText.includes("female") || currentText === "f" || 
              nextText.includes("female") || nextText === "f") {
            foundGender = "female";
            console.log("✓ Gender detected as FEMALE from table cell");
            break;
          } else if (currentText.includes("male") || currentText === "m" ||
                     nextText.includes("male") || nextText === "m") {
            foundGender = "male";
            console.log("✓ Gender detected as MALE from table cell");
            break;
          }
        }
      }
    }
    
    // Method 5: If we still don't find, use female titles as indicator
    if (!foundGender && title) {
      if (title === "WGM" || title === "WIM" || title === "WFM" || title === "WCM" || title === "WNM") {
        foundGender = "female";
        console.log("✓ Gender detected as FEMALE from female-only title:", title);
      }
    }
    
    // Use the found gender or default to "male"
    gender = foundGender || "male";
    console.log("Final gender determination:", gender, foundGender ? "(found)" : "(default to male)");

    // Extraer ratings - buscar en diferentes estructuras
    let standardRating: number | undefined;
    let rapidRating: number | undefined;
    let blitzRating: number | undefined;

    // Search for ratings using multiple regex patterns in the HTML
    // FIDE can show: "Standard: 2500", "Std: 2500", "Classical: 2500", etc.
    const ratingPatterns = [
      // Patterns for Standard - more flexible
      /(?:standard|std|classical|fide)[\s:]*rating[\s:]*(\d{3,4})/i,
      /(?:standard|std|classical)[\s:]*(\d{3,4})/i,
      /"standard_rating":\s*(\d+)/i,
      /"std_rating":\s*(\d+)/i,
      /"classical_rating":\s*(\d+)/i,
      /rating[\s:]*standard[\s:]*(\d{3,4})/i,
      // Patterns for Rapid
      /rapid[\s:]*rating[\s:]*(\d{3,4})/i,
      /rapid[\s:]*(\d{3,4})/i,
      /"rapid_rating":\s*(\d+)/i,
      /rating[\s:]*rapid[\s:]*(\d{3,4})/i,
      // Patterns for Blitz
      /blitz[\s:]*rating[\s:]*(\d{3,4})/i,
      /blitz[\s:]*(\d{3,4})/i,
      /"blitz_rating":\s*(\d+)/i,
      /rating[\s:]*blitz[\s:]*(\d{3,4})/i,
    ];

    // Search for Standard
    for (let i = 0; i < 6; i++) {
      const match = html.match(ratingPatterns[i]);
      if (match) {
        const rating = parseInt(match[1], 10);
        if (rating >= 1000 && rating <= 3000) {
          standardRating = rating;
          console.log("Found Standard rating via regex pattern", i, ":", rating);
          break;
        }
      }
    }

    // Search for Rapid
    for (let i = 6; i < 10; i++) {
      const match = html.match(ratingPatterns[i]);
      if (match) {
        const rating = parseInt(match[1], 10);
        if (rating >= 1000 && rating <= 3000) {
          rapidRating = rating;
          console.log("Found Rapid rating via regex pattern", i, ":", rating);
          break;
        }
      }
    }

    // Search for Blitz
    for (let i = 10; i < 14; i++) {
      const match = html.match(ratingPatterns[i]);
      if (match) {
        const rating = parseInt(match[1], 10);
        if (rating >= 1000 && rating <= 3000) {
          blitzRating = rating;
          console.log("Found Blitz rating via regex pattern", i, ":", rating);
          break;
        }
      }
    }

    // Method 1: Search for ratings using paragraph structure (most reliable method for FIDE)
    // FIDE uses: <p>2289</p><p>STANDARD</p> inside divs with specific classes
    // This method is the most reliable according to tests
    const allParagraphs = doc.querySelectorAll("p");
    for (let i = 0; i < allParagraphs.length - 1; i++) {
      const currentP = allParagraphs[i];
      const nextP = allParagraphs[i + 1];
      const currentText = currentP.textContent?.trim() || "";
      const nextText = nextP.textContent?.trim().toUpperCase() || "";
      
      // Check if the current paragraph contains a rating number
      const ratingMatch = currentText.match(/^(\d{3,4})$/);
      if (ratingMatch) {
        const rating = parseInt(ratingMatch[1], 10);
        if (rating >= 1000 && rating <= 3000) {
          // Check the next paragraph to determine the type
          if (nextText.includes("STANDARD") && !standardRating) {
            standardRating = rating;
            console.log("Found Standard rating via paragraph structure:", rating);
          } else if (nextText.includes("RAPID") && !rapidRating) {
            rapidRating = rating;
            console.log("Found Rapid rating via paragraph structure:", rating);
          } else if (nextText.includes("BLITZ") && !blitzRating) {
            blitzRating = rating;
            console.log("Found Blitz rating via paragraph structure:", rating);
          }
        }
      }
    }

    // Method 2: If we still haven't found all ratings, search in divs with specific classes
    // Note: FIDE uses "profile-standart" (typo) not "profile-standard"
    if (!standardRating || !rapidRating || !blitzRating) {
      const profileStandardDiv = doc.querySelector(".profile-standart, .profile-standard, [class*='profile-standart'], [class*='profile-standard']");
      if (profileStandardDiv && !standardRating) {
        const divText = profileStandardDiv.textContent || "";
        const divClass = profileStandardDiv.className?.toLowerCase() || "";
        // Search for "standart" (FIDE typo) or "standard"
        if (divClass.includes("standart") || divClass.includes("standard") || divText.toUpperCase().includes("STANDARD")) {
          const ratingMatch = divText.match(/\b(\d{3,4})\b/);
          if (ratingMatch) {
            const rating = parseInt(ratingMatch[1], 10);
            if (rating >= 1000 && rating <= 3000) {
              standardRating = rating;
              console.log("Found Standard rating in profile-standart/standard div:", rating);
            }
          }
        }
      }

      const profileRapidDiv = doc.querySelector(".profile-rapid, [class*='profile-rapid']");
      if (profileRapidDiv && !rapidRating) {
        const divText = profileRapidDiv.textContent || "";
        const divClass = profileRapidDiv.className?.toLowerCase() || "";
        if (divClass.includes("rapid") || divText.toUpperCase().includes("RAPID")) {
          const ratingMatch = divText.match(/\b(\d{3,4})\b/);
          if (ratingMatch) {
            const rating = parseInt(ratingMatch[1], 10);
            if (rating >= 1000 && rating <= 3000) {
              rapidRating = rating;
              console.log("Found Rapid rating in profile-rapid div:", rating);
            }
          }
        }
      }

      const profileBlitzDiv = doc.querySelector(".profile-blitz, [class*='profile-blitz']");
      if (profileBlitzDiv && !blitzRating) {
        const divText = profileBlitzDiv.textContent || "";
        const divClass = profileBlitzDiv.className?.toLowerCase() || "";
        if (divClass.includes("blitz") || divText.toUpperCase().includes("BLITZ")) {
          const ratingMatch = divText.match(/\b(\d{3,4})\b/);
          if (ratingMatch) {
            const rating = parseInt(ratingMatch[1], 10);
            if (rating >= 1000 && rating <= 3000) {
              blitzRating = rating;
              console.log("Found Blitz rating in profile-blitz div:", rating);
            }
          }
        }
      }
    }

    // If we still haven't found ratings, search in rating tables
    if (!standardRating || !rapidRating || !blitzRating) {
      // Search in rating tables
      const ratingTables = doc.querySelectorAll("table");
      ratingTables.forEach((table) => {
        const rows = table.querySelectorAll("tr");
        rows.forEach((row) => {
          const cells = Array.from(row.querySelectorAll("td, th"));
          const rowText = row.textContent?.toLowerCase() || "";
          
          cells.forEach((cell, index) => {
            const cellText = cell.textContent?.trim() || "";
            // Search for 3-4 digit numbers that could be ratings
            const ratingMatch = cellText.match(/^(\d{3,4})$/);
            if (ratingMatch) {
              const rating = parseInt(ratingMatch[1], 10);
              if (rating >= 1000 && rating <= 3000) {
                // Determine rating type by context
                const headerText = cells[0]?.textContent?.toLowerCase() || "";
                const fullContext = (rowText + " " + headerText).toLowerCase();

                if ((fullContext.includes("standard") || fullContext.includes("classical") || fullContext.includes("std")) && !standardRating) {
                  standardRating = rating;
                  console.log("Found Standard rating in table:", rating);
                } else if (fullContext.includes("rapid") && !rapidRating) {
                  rapidRating = rating;
                  console.log("Found Rapid rating in table:", rating);
                } else if (fullContext.includes("blitz") && !blitzRating) {
                  blitzRating = rating;
                  console.log("Found Blitz rating in table:", rating);
                }
              }
            }
          });
        });
      });

      // Search in elements with rating-related classes
      const ratingElements = doc.querySelectorAll("[class*='rating'], [id*='rating'], [class*='elo'], [class*='standard'], [class*='rapid'], [class*='blitz']");
      ratingElements.forEach((el) => {
        const text = el.textContent?.trim() || "";
        const ratingMatch = text.match(/(\d{3,4})/);
        if (ratingMatch) {
          const rating = parseInt(ratingMatch[1], 10);
          if (rating >= 1000 && rating <= 3000) {
            const context = (el.className + " " + (el.parentElement?.textContent || "")).toLowerCase();
            
            if ((context.includes("standard") || context.includes("classical") || context.includes("std")) && !standardRating) {
              standardRating = rating;
              console.log("Found Standard rating in element:", rating);
            } else if (context.includes("rapid") && !rapidRating) {
              rapidRating = rating;
              console.log("Found Rapid rating in element:", rating);
            } else if (context.includes("blitz") && !blitzRating) {
              blitzRating = rating;
              console.log("Found Blitz rating in element:", rating);
            }
          }
        }
      });
      
      // Search in divs and spans that contain text like "Standard: 2500" or "2500"
      const allTextElements = doc.querySelectorAll("div, span, p, td, th");
      allTextElements.forEach((el) => {
        const text = el.textContent?.trim() || "";
        // Search for patterns like "Standard: 2500", "Rapid 2500", "Blitz: 2500"
        const standardMatch = text.match(/(?:standard|classical|std)[\s:]*(\d{3,4})/i);
        const rapidMatch = text.match(/rapid[\s:]*(\d{3,4})/i);
        const blitzMatch = text.match(/blitz[\s:]*(\d{3,4})/i);
        
        if (standardMatch && !standardRating) {
          const rating = parseInt(standardMatch[1], 10);
          if (rating >= 1000 && rating <= 3000) {
            standardRating = rating;
            console.log("Found Standard rating in text element:", rating);
          }
        }
        if (rapidMatch && !rapidRating) {
          const rating = parseInt(rapidMatch[1], 10);
          if (rating >= 1000 && rating <= 3000) {
            rapidRating = rating;
            console.log("Found Rapid rating in text element:", rating);
          }
        }
        if (blitzMatch && !blitzRating) {
          const rating = parseInt(blitzMatch[1], 10);
          if (rating >= 1000 && rating <= 3000) {
            blitzRating = rating;
            console.log("Found Blitz rating in text element:", rating);
          }
        }
      });
    }

    // Search for federation (3-letter code)
    let federation: string | undefined;
    const fedMatch = html.match(/"federation":\s*"([A-Z]{3})"/i) || 
                     html.match(/federation[\s:]*([A-Z]{3})/i) ||
                     html.match(/\b([A-Z]{3})\b.*federation/i);
    if (fedMatch) {
      federation = fedMatch[1].toUpperCase();
    } else {
      // Search in DOM elements
      const fedElements = doc.querySelectorAll("[class*='federation'], [class*='country'], [class*='flag'], img[alt*='flag']");
      fedElements.forEach((el) => {
        const text = el.textContent?.trim() || el.getAttribute("title") || el.getAttribute("alt") || "";
        const fedCode = text.match(/\b([A-Z]{3})\b/);
        if (fedCode) {
          federation = fedCode[1];
        }
      });
    }

    // Search for ranks (world and national) - FIDE shows ranks of active players
    let worldRank: number | undefined;
    let nationalRank: number | undefined;

    // Search for ranks in the HTML using multiple patterns
    // FIDE can show: "World Rank: #123" or "Rank World: 123" or in JSON
    const worldRankPatterns = [
      /(?:world|global)[\s_]*rank[\s:]*#?(\d+)/i,
      /rank[\s_]*world[\s:]*#?(\d+)/i,
      /"world_rank":\s*(\d+)/i,
      /"worldRank":\s*(\d+)/i,
      /world[\s_]*position[\s:]*#?(\d+)/i,
      /position[\s_]*world[\s:]*#?(\d+)/i,
    ];

    for (const pattern of worldRankPatterns) {
      const match = html.match(pattern);
      if (match) {
        const rank = parseInt(match[1], 10);
        if (rank > 0 && rank < 1000000) {
          worldRank = rank;
          break;
        }
      }
    }

    const nationalRankPatterns = [
      /(?:national|country)[\s_]*rank[\s:]*#?(\d+)/i,
      /rank[\s_]*national[\s:]*#?(\d+)/i,
      /"national_rank":\s*(\d+)/i,
      /"nationalRank":\s*(\d+)/i,
      /national[\s_]*position[\s:]*#?(\d+)/i,
      /position[\s_]*national[\s:]*#?(\d+)/i,
      /rank[\s_]*in[\s_]*country[\s:]*#?(\d+)/i,
    ];

    for (const pattern of nationalRankPatterns) {
      const match = html.match(pattern);
      if (match) {
        const rank = parseInt(match[1], 10);
        if (rank > 0 && rank < 1000000) {
          nationalRank = rank;
          break;
        }
      }
    }

    // Si no encontramos con regex, buscar en elementos del DOM
    if (!worldRank || !nationalRank) {
      const rankElements = doc.querySelectorAll("[class*='rank'], [class*='position'], td, th, .rank-value, .position-value");
      rankElements.forEach((el) => {
        const text = el.textContent?.trim() || "";
        const rankMatch = text.match(/#?(\d+)/);
        if (rankMatch) {
          const rank = parseInt(rankMatch[1], 10);
          if (rank > 0 && rank < 1000000) {
            const context = ((el.parentElement?.textContent?.toLowerCase() || "") + " " + 
                           (el.closest("tr")?.textContent?.toLowerCase() || "") + " " + 
                           text.toLowerCase()).toLowerCase();
            
            if ((context.includes("world") || context.includes("global")) && !worldRank) {
              worldRank = rank;
            } else if ((context.includes("national") || context.includes("country") || context.includes("federation")) && !nationalRank) {
              nationalRank = rank;
            }
          }
        }
      });
    }

    // Search in ranking tables
    const tables = doc.querySelectorAll("table");
    tables.forEach((table) => {
      const rows = table.querySelectorAll("tr");
      rows.forEach((row) => {
        const cells = row.querySelectorAll("td, th");
        const rowText = row.textContent?.toLowerCase() || "";
        cells.forEach((cell) => {
          const cellText = cell.textContent?.trim() || "";
          const rankMatch = cellText.match(/^#?(\d+)$/);
          if (rankMatch) {
            const rank = parseInt(rankMatch[1], 10);
            if (rank > 0 && rank < 1000000) {
              if ((rowText.includes("world") || rowText.includes("global")) && !worldRank) {
                worldRank = rank;
              } else if ((rowText.includes("national") || rowText.includes("country")) && !nationalRank) {
                nationalRank = rank;
              }
            }
          }
        });
      });
    });

    // Extract profile photo
    let photo: string | undefined;
    
    console.log("Starting photo extraction for FIDE ID:", fideId);
    
    // Search for profile image in different common places
    // FIDE generally uses images in the profile header
    const photoSelectors = [
      "img.profile-top__photo", // FIDE uses double underscores
      ".profile-top-photo img",
      ".profile-photo img",
      ".profile-header img",
      ".player-photo img",
      ".player-header img",
      ".profile-top img",
      "img.profile-photo",
      "img.profile-top-photo",
      "img[class*='profile-photo']",
      "img[class*='profile-top']",
      "img[class*='player-photo']",
      "img[class*='avatar']",
      ".profile-image img",
      ".player-image img",
      "img[src*='/photo/']",
      "img[src*='/upload/']",
      "img[src*='profile']",
      "img[src*='player']",
    ];
    
    console.log("Trying photo selectors...");
    for (const selector of photoSelectors) {
      const img = doc.querySelector(selector);
      if (img) {
        console.log(`Found element with selector "${selector}":`, img.tagName, img.className);
        if (img instanceof HTMLImageElement) {
          let src = img.src || img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
          console.log(`  Image src:`, src);
          if (src) {
            // Filter images that are not profile photos (logos, icons, etc.)
            if (src.includes("logo") || src.includes("icon") || src.includes("flag") || src.includes("badge")) {
              console.log(`  Skipping (logo/icon/flag/badge):`, src);
              continue;
            }
            
            // If it's a data URI (base64), use it directly without modification
            if (src.startsWith("data:")) {
              photo = src;
              console.log("✓ Found photo via selector (data URI):", selector);
            } else if (src.startsWith("//")) {
              photo = `https:${src}`;
            } else if (src.startsWith("/")) {
              photo = `https://ratings.fide.com${src}`;
            } else if (src.startsWith("http")) {
              photo = src;
            } else {
              photo = `https://ratings.fide.com/${src}`;
            }
            console.log("✓ Found photo via selector:", selector, "->", photo.substring(0, 100));
            break;
          }
        }
      }
    }
    
    // If we don't find with selectors, search in the HTML directly
    if (!photo) {
      console.log("No photo found with selectors, searching all images...");
      // Search for all images and filter those that appear to be profile photos
      const allImages = doc.querySelectorAll("img");
      console.log(`Found ${allImages.length} total images in HTML`);
      
      for (let i = 0; i < allImages.length; i++) {
        const img = allImages[i];
        if (img instanceof HTMLImageElement) {
          let src = img.src || img.getAttribute("src") || img.getAttribute("data-src") || "";
          const imgClass = img.className || "";
          const imgAlt = img.getAttribute("alt") || "";
          
          console.log(`Image ${i + 1}:`, { src, class: imgClass, alt: imgAlt });
          
          // Filter logos, icons, flags
          if (src && !src.includes("logo") && !src.includes("icon") && !src.includes("flag") && !src.includes("badge")) {
            // Prefer images that have reasonable dimensions (probably photos)
            const width = img.width || parseInt(img.getAttribute("width") || "0");
            const height = img.height || parseInt(img.getAttribute("height") || "0");
            
            console.log(`  Dimensions: ${width}x${height}`);
            
            // FIDE uses small images sometimes, so lower the threshold
            if ((width > 50 && height > 50 && width < 500 && height < 500) || 
                (width === 0 && height === 0 && (src.includes("upload") || src.includes("photo")))) {
              // If it's a data URI (base64), use it directly without modification
              if (src.startsWith("data:")) {
                photo = src;
                console.log("✓ Found photo via image scan (data URI)");
              } else if (src.startsWith("//")) {
                photo = `https:${src}`;
              } else if (src.startsWith("/")) {
                photo = `https://ratings.fide.com${src}`;
              } else if (src.startsWith("http")) {
                photo = src;
              } else {
                photo = `https://ratings.fide.com/${src}`;
              }
              console.log("✓ Found photo via image scan:", photo.substring(0, 100));
              break;
            }
          }
        }
      }
    }
    
    // Last attempt: search in the HTML with regex
    if (!photo) {
      console.log("Trying regex patterns on raw HTML...");
      const imgPatterns = [
        /<img[^>]+src=["']([^"']*\/photo\/[^"']*)["']/i,
        /<img[^>]+src=["']([^"']*\/upload\/[^"']*)["']/i,
        /<img[^>]+src=["']([^"']*profile[^"']*\.(jpg|jpeg|png|webp))["']/i,
        /background-image:\s*url\(["']?([^"')]*profile[^"')]*\.(jpg|jpeg|png|webp))["']?\)/i,
        /<img[^>]+src=["']([^"']*player[^"']*\.(jpg|jpeg|png|webp))["']/i,
      ];
      
      for (const pattern of imgPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          console.log(`Regex match found:`, match[1].substring(0, 100));
          if (!match[1].includes("logo") && !match[1].includes("icon") && !match[1].includes("flag")) {
            let src = match[1];
            // If it's a data URI (base64), use it directly without modification
            if (src.startsWith("data:")) {
              photo = src;
              console.log("✓ Found photo via regex pattern (data URI)");
            } else if (src.startsWith("//")) {
              photo = `https:${src}`;
            } else if (src.startsWith("/")) {
              photo = `https://ratings.fide.com${src}`;
            } else if (src.startsWith("http")) {
              photo = src;
            } else {
              photo = `https://ratings.fide.com/${src}`;
            }
            console.log("✓ Found photo via regex pattern:", photo.substring(0, 100));
            break;
          }
        }
      }
    }

    // If we find a photo, download it locally
    if (photo) {
      console.log("Photo found, downloading to local storage:", photo.substring(0, 100));
      try {
        // Use Tauri command to save the photo locally
        // Note: Tauri/Specta converts snake_case to camelCase
        const localPhotoPath = await invoke<string>("save_fide_photo", {
          fideId: fideId,
          photoData: photo,
        });
        console.log("✓ Photo saved locally at:", localPhotoPath);
        
        // Store the file path directly (not the converted URL)
        // The URL conversion should happen when displaying the image, not when saving
        // This ensures the path works correctly in both dev and production
        photo = localPhotoPath;
        console.log("✓ Photo path stored:", photo);
      } catch (error) {
        console.error("❌ Failed to save photo locally:", error);
        console.error("Error details:", JSON.stringify(error));
        // If saving fails, set photo as undefined to avoid showing empty frame
        photo = undefined;
        console.log("Photo set to undefined due to save error");
      }
    } else {
      console.warn("⚠️ No photo found for FIDE ID:", fideId);
      // Ensure photo is explicitly undefined
      photo = undefined;
      // Search for all images in the HTML for debugging
      const allImgTags = html.match(/<img[^>]+>/gi);
      if (allImgTags && allImgTags.length > 0) {
        console.log("All img tags found in HTML (first 5):", allImgTags.slice(0, 5));
      } else {
        console.log("No img tags found in HTML");
      }
    }

    // Log HTML snippet for debugging if ratings are missing
    if (!standardRating && !rapidRating && !blitzRating) {
      console.warn("No ratings found in FIDE HTML for ID:", fideId);
      console.warn("HTML snippet (first 10000 chars):", html.substring(0, 10000));
      // Search for any 3-4 digit numbers in the HTML for debugging
      const allRatings = html.match(/\b(\d{3,4})\b/g);
      if (allRatings) {
        console.warn("All 3-4 digit numbers found in HTML:", allRatings.slice(0, 20));
      }
    } else {
      console.log("Ratings found:", { standard: standardRating, rapid: rapidRating, blitzRating });
    }
    
    console.log("Final FIDE data:", { fideId, fullName, gender, title, age, birthYear, standardRating, rapidRating, blitzRating, photo });

    return {
      fideId,
      name: fullName,
      firstName,
      lastName,
      gender,
      title,
      rating: standardRating,
      standardRating,
      rapidRating,
      blitzRating,
      federation,
      worldRank,
      nationalRank,
      photo,
      birthYear,
      age,
    };
  } catch (error) {
    console.error("Error fetching FIDE player:", error);
    return null;
  }
}

/**
 * Searches for FIDE information using an alternative service
 * Can use APIs like chess.com, lichess, or third-party services that have FIDE data
 */
export async function searchFidePlayerByName(name: string): Promise<FidePlayer[]> {
  try {
    // Placeholder - in production this should search in a FIDE database
    return [];
  } catch (error) {
    console.error("Error searching FIDE player:", error);
    return [];
  }
}