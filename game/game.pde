/*

save files with high score, coins 



*/














































boolean music = false;
boolean mobile = false;

//used for slowing animation
float gameSpeed = 1;

//type of weapon player is holding
//0 = pistol, 1 = knife, 2 = sniper, 3 = shotgun, 4 = machineGun, 5 = rocketLauncher, 6 = stick
int using = 0;

//variable statistics
float bulletDamage = 0;
//amount bonus for some powerups
int[] amount;

String save;
String[] saveFile; 
String[] loadData;
  //main font
PFont font;

  //determines size of background squares
float squareSize = 80;
  //title screen fades out
int titleFade;

color playerColor;
color enemyColor;

boolean startScreen, endScreen, pause, shopScreen;
    //shop menus
  boolean upgradeScreen, skinScreen, powerupScreen;
    //upgrade menu
  int upgradeScreenMenu = 0;
    //which guns are purchased
  boolean[] purchasedWeapons;
    //powerup levels:
      //0 = coin magnet
      //1 = infinite ammo
      //2 = mega coin
      //3 = regen
      //4 = sheild
  int[] powerups = new int[5];

  //start position of player
PVector startPosition;
  //player
Player p;

  //enemies
ArrayList<Enemy> enemies;
  //aiming on mobile
Enemy closestEnemy;
  //amount of time before enemy spawns
int spawnInterval = 25;
  //game time % when bosses spawn
int bossRound = 400;
  //is the boss alive
boolean bossAlive;

  //particle trail behind player
ArrayList<Particle> contrail;

  //any explosion made on screen
ArrayList<Explosion> explosions;

  //determines how fast weapons despawn
float lifespanIncrement = 0.03;
  //powerups
ArrayList<Powerup> boosts;
    //boost duration for type 1, 2, 5 (coin magnet, infinite ammo, sheild)
  int[] powerupDuration;
    //determines which powerups are active
  int[] active;
  //all weapon types
ArrayList<Gun> weapons;
  //bullets fired from player and enemies
ArrayList<Bullet> bullets;
  //gun which player is holding
Gun carried;
  //coins
ArrayList<Coin> coins;
  //amount of coins player has collected this round
int collectedCoins, finalCollectedCoins;
  //total number of coins player has
int totalCoins;

  //player score, highest score, bonus points, amount score has to be divided by
float score, scoreFrac;
int highScore, bonus;
  //bonus indicators arraylist
ArrayList<Bonus> bonuses;

  //x of function for spawning enemies
int round = 1;
  //number of games played
int gameNum = 0;
  //tutorial screen is out
boolean minimize = false;
  //sliding tutorial screen animation
int slide = 0;

boolean canSpawn = true;
boolean coinSpawn = false;

void setup() {
  
      //igonore amount[0]
  amount = new int[6];
  
  purchasedWeapons = new boolean[7];
  
    //load save data
  loadData = loadStrings("saveFile.txt");
  highScore = parseInt(loadData[0]);
  totalCoins = parseInt(loadData[1]);
  
  for (int i = 2; i < 2 + powerups.length; i++) {
    powerups[i-2] = parseInt(loadData[i]);
  }
  
  for (int i = 2 + powerups.length; i < 2 + powerups.length + amount.length; i++) {
    amount[i - 2 - powerups.length] = parseInt(loadData[i]);
  }
  
  for (int i = 2 + powerups.length + amount.length; i < 2 + powerups.length + amount.length + purchasedWeapons.length; i++) {
    purchasedWeapons[i - (2 + powerups.length + amount.length)] = parseBoolean(loadData[i]);
  }
  
  using = parseInt(loadData[2 + powerups.length + amount.length + purchasedWeapons.length]);
  
  font = loadFont("AppleBraille-Pinpoint8Dot-120.vlw");
  
  playerColor = color(28, 212, 196);
  enemyColor = color(168, 72, 50);
  
  startScreen = true;
  endScreen = false;
  upgradeScreen = true;
  titleFade = 40;
  
    //determines size of background squares
  for (float i = 0; i < 30; i+=0.5) {
  if (width/(squareSize + i) - floor(width/(squareSize + i)) > 0.9)
    if (height/(squareSize + i) - floor(height/(squareSize + i)) > 0.9) {
      squareSize = squareSize + i;
      i = 30;
    }
}
  
  startPosition = new PVector(width/2, height/2);
  p = new Player(startPosition);
  
  enemies = new ArrayList<Enemy>();
  
  contrail = new ArrayList<Particle>();
  
  explosions = new ArrayList<Explosion>();
  
  boosts = new ArrayList<Powerup>();
    powerupDuration = new int[6];
    active = new int[5];
  weapons = new ArrayList<Gun>();
  bullets = new ArrayList<Bullet>();
  coins = new ArrayList<Coin>();
  
  bonuses = new ArrayList<Bonus>();
  
  scoreFrac = 40;
 
  //size (1500, 900, P2D);
  fullScreen();
  
  //smooth(8);
  //cursor(CROSS);
  noCursor();
}

void keyPressed() {
  p.keyPressed();
}

  //finds pvector farther than 300 pixels from player
PVector spawnPos() {
  PVector spawnPosition = new PVector(random(50, width-50), random(50, height-50));
  
  for (int i = 0; i < 10; i++) {
    if (dist(spawnPosition.x, spawnPosition.y, p.pos.x, p.pos.y) < 500)
      spawnPosition = new PVector(random(50, width-50), random(50, height-50));
    else return spawnPosition;
  }
  
  return spawnPosition;
}

void mouseClicked() {
  
    //shop
  if (shopScreen == true) {
    
      //skins
    if (skinScreen == true) {
      if (dist(mouseX, mouseY, width - 100, height/2) < 40) {skinScreen = false; upgradeScreen = true; }
    }
    
    //upgrades
    if (upgradeScreen == true) {
      if (dist(mouseX, mouseY, width - 100, height/2) < 40) {upgradeScreen = false; powerupScreen = true; }
      if (dist(mouseX, mouseY, 100, height/2) < 40) {upgradeScreen = false; skinScreen = true; }
      
      if (dist(mouseX, mouseY, width/2 - 400, height/2) < 30 && upgradeScreenMenu > 0) { upgradeScreenMenu --; }
      if (dist(mouseX, mouseY, width/2 + 400, height/2) < 30 && upgradeScreenMenu < 6) { upgradeScreenMenu ++; }
      
      if (mouseX > width/2 - 350 && mouseX < width/2 + 350 && mouseY > height/2 + 200 && mouseY < height/2 + 400) {
        if (purchasedWeapons[upgradeScreenMenu] == false) { 
          
          if (upgradeScreenMenu < 5) {
            
            if (totalCoins >= (int)sq(upgradeScreenMenu)*500) {
              
              purchasedWeapons[upgradeScreenMenu] = true;
              totalCoins -= (int)sq(upgradeScreenMenu)*500;
              saveData();
            }
            
          } else if (upgradeScreenMenu == 5) {
            
            if (highScore > 2000 && totalCoins >= 25000) {
              
              purchasedWeapons[5] = true;
              totalCoins -= 25000;
              saveData();
              
            }
          } else if (upgradeScreenMenu == 6) {
            
            if (highScore > 2500 && totalCoins >= 50000) {
              
              purchasedWeapons[6] = true;
              totalCoins -= 50000;
              saveData();
              
            }
          }
        }
      }
      
      if (mouseX > 50 && mouseX < 350 && mouseY > height/2 + 150 && mouseY < height/2 + 250 && using != upgradeScreenMenu) {
        using = upgradeScreenMenu;
        saveData();
      }
    }
    
    //powerups
    if (powerupScreen == true) {
      if (dist(mouseX, mouseY, width - 100, height/2) < 40) {shopScreen = false; startScreen = true; }
      if (dist(mouseX, mouseY, 100, height/2) < 40) {powerupScreen = false; upgradeScreen = true; }
    }
  }
  
   //start screen
  if (startScreen == true) {
      //play
    if (mouseX > 420 && mouseX < width - 420 && mouseY > height/3*2 - 110 && mouseY < height/3*2 + 10) {
      newGame();
    }
      
      //shop
    if (dist(mouseX, mouseY, 100, height/2) < 40) {
      startScreen = false;
      shopScreen = true;
      skinScreen = false;
      upgradeScreen = false;  
      powerupScreen = true;
    }
  }
  
  //pause game
  if (mouseX > 25 && mouseX < 83 && mouseY > 15 && mouseY < 80 && startScreen == false && endScreen == false) {
    pause = true;
  }
    
  if (pause == true) {
      //resume
    if (mouseX > 380 && mouseX < width-380 && mouseY > 200 && mouseY < height/2) {
      pause = false;
      titleFade = 20;
    }
      //menu
    if (mouseX > 380 && mouseX < width-380 && mouseY > height/2 && mouseY < height-200) {
      pause = false;
      startScreen = true;
      titleFade = 20;
    }
  }
    //end screen
  if (endScreen == true) {
      //play again
    if (mouseX > 420 && mouseX < width - 420 && mouseY > height/3*2 - 110 && mouseY < height/3*2 + 10 && titleFade > 140) {
      newGame();
    }
    
      //back to start screen
    if (mouseX > 420 && mouseX < width - 420 && mouseY > height/3*2 - 30 && mouseY < height/3*2 + 150 && titleFade >= 150) {
        startScreen = true;
        endScreen = false;
    }
  }
}

  //save data
void saveData() {
  
  save = new String("");
  save += highScore + " " + (collectedCoins + totalCoins);
      
  for (int i = 0; i < powerups.length; i++) save += " " + powerups[i];
  for (int i = 0; i < amount.length; i++) save += " " + amount[i];
  for (int i = 0; i < purchasedWeapons.length; i++) save += " " + purchasedWeapons[i];
  save += " " + using;
  
  saveFile = split(save, ' ');
  saveStrings("saveFile.txt", saveFile);
 
}

  //spawns powerups
void spawnPowerup(PVector pos) {
  
  float i = random(0, 2);
  
  if (i > 1) boosts.add(new Powerup(pos, floor((i-1)*5) + 1));
}

  //responsable for spawning  enemies, bosses, general game progression
void spawnEnemy() {
  
  if (pause == false) score += gameSpeed;
  
    //stage 1
    
  if (floor(score/scoreFrac) % bossRound == bossRound-2) canSpawn = true;
  
  if (floor(score/scoreFrac) % bossRound != bossRound-1) {
    
    if (floor(score/scoreFrac) % spawnInterval == 1 && canSpawn == true && bossAlive == false) {
        canSpawn = false;
        for (int i = 0; i <= floor(score/scoreFrac); i += 150) {
          enemies.add(new Enemy(spawnPos(), 50 - round/2, 10 + round, 100 + 4*round, 1, 0.08));
          spawnInterval = 25 + (i/150)*5;
        }
        round ++;
      } else if (floor(score/scoreFrac) % spawnInterval == 3) canSpawn = true;
  } else if (canSpawn == true) {
    enemies.add(new Boss1(spawnPos(), 150, 100, 2000, 14, 0.04));
    canSpawn = false;
    bossAlive = true;
  }
}

  //show weapon in menu screen
void displayWeapon (PVector pos, int index, int size) {
  
  pushMatrix();
  translate(pos.x, pos.y);
  
  if (index == 0) {
    
    fill(120);
    textSize(50);
    if (upgradeScreenMenu == index) text("pistol", 0, -size*1.2);
    
    translate(-size*0.4, 0);
      
    rotate(-PI/5);
    noStroke();
    fill(140, 140, 140, 250);
    rect(size*0.1 - 6, - 6, size*0.3, size, 10);
    fill(180, 180, 180, 250);
    rect(- 6, - 6, size*1.2, size*0.4);
    rect(- 6, size*0.4 + - 6, size*0.5, size*0.2);
    rect(- 6, size*0.5 + - 6, size*0.8, size*0.05);
    fill(110);
    rect(size*0.1 + - 6, size*0.1 + - 6, size*0.7, size*0.2, 10);

  }
  
  if (index == 1) {
    
    fill(120);
    textSize(50);
    if (upgradeScreenMenu == index) text("knife", 0, -size*1.2);
    
    rotate(PI*6/5);
    noStroke();
    fill(102, 60, 0);
    rect(-size*0.15, -size*0.7, size*0.3, size*0.6);
    fill(100);
    ellipse(0, -size*0.7, size*0.5, size*0.5);
    fill(28, 212, 196);
    ellipse(0, -size*0.7, size*0.2, size*0.2);
    fill(150);
    quad(0, -size*0.1, -size*0.2, -size*0.1, -size*0.13, size*0.5, 0, size*0.7);
    fill(110);
    quad(0, -size*0.1, size*0.2, -size*0.1, size*0.13, size*0.5, 0, size*0.7);
    fill(130);
    triangle(0, -size*0.3, -size*0.4, -size*0.1, size*0.4, -size*0.1);
    
  }
  
  if (index == 2) {
    
    fill(120);
    textSize(50);
    if (upgradeScreenMenu == index) text("sniper", 0, -size*1.2);
    
    translate(-size/2 - 10, -10);
      
    noFill();
    stroke(130);
    strokeWeight(3);
    ellipse(13, 4 + size*0.5, size*0.4, size*0.3);
    noStroke();
    fill(48, 29, 0);
    rect(1, 0, size*0.4, size, 15);
    fill(102, 60, 0);
    rect(0, 5, size, size*0.5, 10);
    fill(180);
    rect(size, size*0.175 + 5, size*1.3, size*0.15);
    fill(210);
    triangle(size*1.3, size*0.1, size*0.8, size*0.25, size*1.3, size*0.4);
    fill(160);
    rect(size*0.5, size*0.15, size*0.6, size*0.2);
    rect(size*1.3, size*0.1, size*0.2, size*0.3);
    
  }
  
  if (index == 3) {
    
    fill(120);
    textSize(50);
    if (upgradeScreenMenu == index) text("shotgun", 0, -size*1.2);
    
    translate(-size/3, 0);
      
    noFill();
    stroke(80);
    strokeWeight(2);
    ellipse(-size*0.05, size*0.17, 4, 4);
    noStroke();
    fill(80);
    rect(-size*0.4, 0, size*0.3, size*0.35, 2);
    fill(90);
    rect(-size*0.3, -size*0.05, size*1.4, size*0.14, 5);
    fill(140);
    rect(-size*0.3, size*0.15, size*1.4, -size*0.14, 5);
    fill(102, 60, 0);
    rect(-size*0.5, -size*0.06, size*0.6, size*0.22, 5);
    fill(160);
    ellipse(-size*0.3, 0, size*0.1, size*0.05);
    rect(0, -size*0.05, size*0.3, size*0.08, 5);
    
  }
  
  if (index == 4) {
    
    fill(120);
    textSize(50);
    if (upgradeScreenMenu == index) text("machine gun", 0, -size*1.2);
    
    translate(-size/2, 0);
    
    pushMatrix();
    stroke(60);
    rotate(PI/6);
    rect(-size*0.15, 0, size*0.3, size*0.6, 3);
    popMatrix();
  
    stroke(60);
    strokeWeight(1 * size/35);
      line(0, -8.75 * size/35, size*1.34, -8.75 * size/35);
      line(0, 8.75 * size/35, size*1.34, 8.75 * size/35);
    stroke(90);
    strokeWeight(2 * size/35);
    line(size*0.8, 0, size*1.05, size*0.8);
    line(size*0.8, 0, size*1.2, size*0.45);
      noStroke();
    fill(50);
      rect(size*0.7, -size*0.3, size*0.1, size*0.6, 5);
    stroke(150);
    strokeWeight(4 * size/35);
      line(0, 0, size*1.399, 0);
    stroke(120);
    strokeWeight(3.5 * size/35);
      line(0, -3.5 * size/35, size*1.39, -3.5 * size/35);
      line(0, 3.5 * size/35, size*1.39, 3.5 * size/35);
    stroke(90);
    strokeWeight(2.5 * size/35);
      line(0, -6.5 * size/35, size*1.37, -6.5 * size/35);
      line(0, 6.5 * size/35, size*1.37, 6.5 * size/35);
    stroke(30);
    fill(0);
      noStroke();
    fill(163);
      rect(-size/3, -size/3, size/3*2, size/3*2, 5);
    fill(100);
      rect(-size/4, -size/4, size, size/2, 5);
  }
  
  if (index == 5) {
    
    if (highScore > 2000) {
      
      fill(120);
      textSize(50);
      if (upgradeScreenMenu == index) text("rocket launcher", 0, -size*1.2);
      
      noStroke();
      fill(75);
      rect(-size*0.2, 0, size*0.2, size*0.5, 3);
      rect(size*0.2, 0, size*0.15, size*0.4, 3);
      fill(165);
      triangle(-size*0.8, -size*0.25, -size*0.77, size*0.25, -size*0.4, 0);
      fill(145);
      rect(-size*0.6, -size*0.15, size*1.4, size*0.3);
      fill(100);
      rect(-size*0.1, -size*0.15, size*0.08, size*0.3);
      fill(90);
      rect(-size*0.2, -size*0.05, size*0.4, size*0.1, 5);
      stroke(playerColor);
      strokeWeight(2);
      line(-size*0.15, 0.01, size*0.15, 0.01);
      noStroke();
      rect(size*0.5, -size*0.18, size*0.3, size*0.36, 1);
      fill(120);
      quad(size*0.8, -size*0.18, size*0.8, size*0.18, size*0.9, size*0.23, size*0.9, -size*0.23);
      fill(145);
      rect(size*0.9, -size*0.23, size*0.1, size*0.46);
      
    } else {
      
      fill(60);
      textSize(50);
      if (upgradeScreenMenu == index) text("???", 0, -size*1.2);
      
      noStroke();
      rect(-size*0.2, 0, size*0.2, size*0.5, 3);
      rect(size*0.2, 0, size*0.15, size*0.4, 3);
      triangle(-size*0.8, -size*0.25, -size*0.77, size*0.25, -size*0.4, 0);
      rect(-size*0.6, -size*0.15, size*1.4, size*0.3);
      rect(-size*0.1, -size*0.15, size*0.08, size*0.3);
      rect(-size*0.2, -size*0.05, size*0.4, size*0.1, 5);
      stroke(30);
      strokeWeight(0.5);
      line(-size*0.15, 0.01, size*0.15, 0.01);
      noStroke();
      rect(size*0.5, -size*0.18, size*0.3, size*0.36, 1);
      quad(size*0.8, -size*0.18, size*0.8, size*0.18, size*0.9, size*0.23, size*0.9, -size*0.23);
      rect(size*0.9, -size*0.23, size*0.1, size*0.46);
      
    }
    
  }
  
  if (index == 6) {
    
    if (highScore >= 2500) {
      
      fill(120);
      textSize(50);
      if (upgradeScreenMenu == index) text("stick", 0, -size*1.2);
      
      noStroke();
      fill(0, 120, 32);
      beginShape();
        vertex(size*0.4, size*0.2);
        vertex(size*0.55, size*0.35);
        vertex(size*0.7, size*0.3);
        vertex(size*0.6, size*0.21);
      endShape();
      fill(120, 76, 0);
      beginShape();
        vertex(-size*0.4, 0);
        vertex(size*0.1, size*0.3);
        vertex(size*0.7, size*0.15);
        vertex(size*0.75, size*0.08);
        vertex(size*0.19, size*0.18);
      endShape();
      fill(94, 58, 0);
      beginShape();
        vertex(-size*0.5, -size*0.05);
        vertex(-size*0.6, size*0.17);
        vertex(-size*0.2, size*0.3);
        vertex(size*0.8, -size*0.2);
        vertex(size*0.7, -size*0.3);
        vertex(0, 0);
      endShape();
      
    } else if (highScore > 1500) {
      
      fill(60);
      textSize(50);
      if (upgradeScreenMenu == index) text("???", 0, -size*1.2);
      
      noStroke();
      beginShape();
        vertex(size*0.4, size*0.2);
        vertex(size*0.55, size*0.35);
        vertex(size*0.7, size*0.3);
        vertex(size*0.6, size*0.21);
      endShape();
      beginShape();
        vertex(-size*0.4, 0);
        vertex(size*0.1, size*0.3);
        vertex(size*0.7, size*0.15);
        vertex(size*0.75, size*0.08);
        vertex(size*0.19, size*0.18);
      endShape();
      beginShape();
        vertex(-size*0.5, -size*0.05);
        vertex(-size*0.6, size*0.17);
        vertex(-size*0.2, size*0.3);
        vertex(size*0.8, -size*0.2);
        vertex(size*0.7, -size*0.3);
        vertex(0, 0);
      endShape();
      
    } else {
      
      fill(60);
      textSize(50);
      if (upgradeScreenMenu == index) text("???", 0, -size*1.2);
      
      fill(50);
      noStroke();
      ellipse(0, 0, size*0.8, size*0.8);
    }
    
  }
  
  popMatrix();
  
}

  //resets conditions for game
void newGame() {
  p.charge = 0;
  score = 0;
  bonus = 0;
  startScreen = false;
  endScreen = false;
  p.pos = new PVector(width/2, height/2 + 10);
  p.health = 200;
  p.vel = new PVector(0, 0);
  bonuses.clear();
  bullets.clear();
  coins.clear();
  enemies.clear();
  explosions.clear();
  weapons.clear();
  bonuses.clear();
  collectedCoins = 0;
  round = 1;
  gameNum ++;
  titleFade = 40;
  canSpawn = true;
  bossAlive = false;
  boosts.clear();
  
  for (int i = 0; i < powerupDuration.length; i++)
    powerupDuration[i] = 0;
  
  if (using == 0) weapons.add(new Pistol(p.pos));
  else if (using == 1) weapons.add(new Knife(p.pos));
  else if (using == 2) weapons.add(new Sniper(p.pos));
  else if (using == 3) weapons.add(new Shotgun(p.pos));
  else if (using == 4) weapons.add(new MachineGun(p.pos));
  else if (using == 5) weapons.add(new RocketLauncher(p.pos));
  else if (using == 6) weapons.add(new Stick(p.pos));
}

  //for creating buttons
void button(float x, float y, float sizeX, float sizeY, String text) {
  noFill();
  if (mouseX > x - sizeX/2 && mouseX < x + sizeX/2 && mouseY > y - sizeY/2 && mouseY < y + sizeY/2) stroke(150);
  else stroke(120);
  strokeWeight(4);
  rect(x-sizeX/2, y - sizeY/2, sizeX, sizeY);
  if (mouseX > x - sizeX/2 && mouseX < x + sizeX/2 && mouseY > y - sizeY/2 && mouseY < y + sizeY/2) fill(150);
  else fill(120);
  textAlign(CENTER, CENTER);
  if (sizeY < sizeX*3) textSize(sizeY/3);
  else textSize(sizeX/9);
  text(text, x, y);
}

void mouse() {
  
  if (powerupDuration[2] <= 0) { stroke(255); fill(255); }
  else { stroke(255, 140, 0); fill(255, 140, 0); }
  strokeWeight(1.5);
  line(mouseX - 12, mouseY, mouseX - 6, mouseY);
  line(mouseX + 6, mouseY, mouseX + 12, mouseY);
  line(mouseX, mouseY - 12, mouseX, mouseY - 6);
  line(mouseX, mouseY + 6, mouseX, mouseY + 12);
  
  noStroke();
  ellipse(mouseX, mouseY, 1.5, 1.5);
}

void draw () {
  
  for (Explosion e : explosions) e.quake();
  
  p.slowMo();
  
  translate(-p.pos.x/(10*(gameSpeed/2+0.5)) + width/(20*(gameSpeed/2+0.5)), -p.pos.y/(10*(gameSpeed/2+0.5)) + height/(20*(gameSpeed/2+0.5)));
  
  if (startScreen == true) {
    
    titleFade = 40;
    background(titleFade);
    
    stroke(55);
    strokeWeight(0.5);
    for (int x = 1; x < width/squareSize; x ++)
      line (x*squareSize, 0, x*squareSize, height);
    for (int y = 1; y < height/squareSize + 1; y++)
      line (0, y*squareSize, width, y*squareSize);
    
    textFont(font);
    textAlign(CENTER, CENTER);
    textSize(140);
    fill(120);
    text("io.io", width/2, height/6+160);
    textFont(font);
    textSize(40);
    if(highScore != 0) text("high score: " + highScore, width/2, height/6 + 260);
    fill(50);
    rect(width/7*2, height/6, width/7*3, 80);
    fill(120);
    textSize(50);
    text(totalCoins, width/2, height/6 + 40);
    stroke(156, 96, 0, 230);
    strokeWeight(5);
    fill(255, 195, 15, 230);
    ellipse(width/7*5 - 40, height/6+40, 40, 40);
    fill(120);
    
    button(width/2, height/3*2-50, width-840, 120, "play");
    
      //shop
    pushMatrix();
    translate(100, height/2);
    noStroke();
    if (dist(mouseX, mouseY, 100, height/2) < 40) fill(150);
    else fill(120);
    rotate(-PI/4);
    rect(-25, -25, 50, 10, 5);
    rotate(-PI/2);
    rect(-25, -25, 50, 10, 5);
    popMatrix();
   
    p.pos = new PVector(width/2, height/2);
    p.vel = new PVector(0, 0);
    
    
  } else if (endScreen == false && shopScreen == false) {
    
    background(titleFade);
    
    if (titleFade > 21 && pause == false) titleFade -= sq(21 - titleFade)/100;
    if (pause == true) background(20);
    
    stroke(35);
    strokeWeight(0.5);
    for (int i = 1; i < height/squareSize; i ++)
      line(0, i*squareSize, width, i*squareSize);
    for (int i = 1; i < width/squareSize; i++)
      line(i*squareSize, 0, i*squareSize, height);
    
    textFont(font);
    textAlign(LEFT, DOWN);
    textSize(60);
    fill(90);
    //text("health", 20, height-50);
    
    if (p.health > 0) {
      fill(0, 100, 0);
      noStroke();
      rect(width/2 - 500, 50, p.health*5, 8);
      fill(100, 0, 0);
      rect(width/2 + 500, 50, -(200 - p.health) * 5, 8);
    } else {
      fill(100, 0, 0);
      rect(width/2 - 500, 50, 1000, 8);
    }
    
    textAlign(RIGHT, DOWN);
    fill(90);
    text((floor(score/scoreFrac) + bonus), width-20, height-30);
    
    fill(10, 200);
    if (collectedCoins < 10) quad(width-100, height-155, width-120, height-100, width + 110, height-100, width + 110, height-155);
    else if (collectedCoins < 100) quad(width-125, height-155, width-145, height-100, width + 110, height-100, width + 110, height-155); 
    else if (collectedCoins < 1000) quad(width-150, height-155, width-170, height-100, width + 110, height-100, width + 110, height-155);
    else quad(width-175, height-155, width-195, height-100, width + 110, height-100, width + 110, height-155);
    fill(90);
    textSize(45);
    text(collectedCoins, width-60, height-110);
    stroke(156, 96, 0);
    strokeWeight(4);
    fill(255, 195, 15);
    ellipse(width-35, height-127.5, 25, 25);
    
    for (int i = 0; i < active.length; i++) {
      
      if (active[i] != 0 && powerupDuration[active[i]] <= 0) active[i] = 0;
      
      if (active[i] == 1) fill(186, 55, 7);
      if (active[i] == 2) fill(255, 140, 0);
      if (active[i] == 5) fill(20, 147, 201);
      
      noStroke();
      if (active[i] > 0) rect(width/2 - powerupDuration[active[i]]/4, 68 + i*18, powerupDuration[active[i]]/2, 8);
    }
    
    spawnEnemy();
    
    //if (floor(score/scoreFrac) % 5 == 0 && coinSpawn == true) { coins.add (new Coin(new PVector(random(10, width-10), random(10, height-10)), false)); coinSpawn = false; }
    //if (floor(score/scoreFrac) % 5 == 2) coinSpawn = true;
    
    for (int i = 0; i < coins.size(); i++) {
      Coin c = coins.get(i);
      if (pause == false) c.move();
      c.display();
      
      if (c.collected() == true) {
        coins.remove(i);
        collectedCoins++;
      }
    }
    
      //draws bullets, remove bullets if they hit the edge or hit a player
    for (int i = 0; i < bullets.size(); i++) {
      Bullet b = bullets.get(i);
      if (pause == false) b.move();
      b.display();
      b.hit();
      
      if (b.hit() == true)
        bullets.remove(b);
    }
    
    for (int i = 0; i < weapons.size(); i++) {
      Gun g = weapons.get(i);
      if (pause == false) g.move();
      g.display();
    }
    
    for (int i = 0; i < boosts.size(); i++) {
      Powerup r = boosts.get(i);
      r.display();
      
      if (r.used()) boosts.remove(r);
    }
    
    for (int i = 0; i < powerupDuration.length; i++) {
      if (powerupDuration[i] > 0 && i != 5) powerupDuration[i] --;
    }
    
      //checks if enemies merge or if enemy is dead
    for (int i = 0; i < enemies.size(); i++) {
      Enemy e = enemies.get(i);
      if (pause == false) e.move();
      e.display();
      e.checkCollision(p);
      
      if (mobile == true) {
        if (closestEnemy == null)
          closestEnemy = e;
        
        if (dist(closestEnemy.pos.x, closestEnemy.pos.y, p.pos.x, p.pos.y) > dist(e.pos.x, e.pos.y, p.pos.x, p.pos.y))
          closestEnemy = e;
      }
      
      for (int j = 0; j < enemies.size(); j++) {
        Enemy f = enemies.get(j);
        if (dist(e.pos.x, e.pos.y, f.pos.x, f.pos.y) < 4 && e != f && e.canCombine && f.canCombine) {
          explosions.add(new Explosion(e.pos, e.size, color(255)));
          enemies.add(new Enemy(e.pos, (e.rate+f.rate)/4.5, e.damage*0.8 + f.damage*0.8, e.health+f.health, f.value + e.value, e.speed*0.6 + f.speed*0.6));
          enemies.remove(e);
          enemies.remove(f);
        }
      }
        
      if (e.isDead() == true && pause == false) {
          //probability a new weapon is dropped
        for (int j = 0; j < e.value; j++) {
          float probability = random(0, 1);
        
          spawnPowerup(e.pos);
          
          for (float k = 0.1; k < 1; k += 0.2)
          if (probability > j) coins.add(new Coin(new PVector(e.pos.x, e.pos.y), true));
        }
        
        if (i <= round/2) {
          bonuses.add(new Bonus(new PVector(e.pos.x, e.pos.y), spawnInterval - floor(score/scoreFrac)%spawnInterval, color(255)));
          bonus += spawnInterval - floor(score/scoreFrac)%spawnInterval;
        }
        
        explosions.add(new Explosion(new PVector(e.pos.x, e.pos.y), e.size/2, color(168, 72, 50)));
        enemies.remove(i);
        
          //checks if enemy is boss
        if (e.canCombine == false) {
          for (Enemy g : enemies)
            g.health = 0;
          
          bonus += 200;
          bonuses.add(new Bonus(e.pos, 200, color(255)));
          bossAlive = false;
        }
      }
    }
    
    if (p.isDead()) {
      
      explosions.add(new Explosion(new PVector(p.pos.x, p.pos.y), 15, color(28, 212, 196, 70)));
      endScreen = true;
      p.pos = new PVector(width/2, height/2);
      fill(100, 0, 0, 150);
      rect(410, height-20, -400, 4);
      bonuses.clear();
      finalCollectedCoins = collectedCoins;
      if (floor(score/scoreFrac)+bonus > highScore) highScore = floor(score/scoreFrac)+bonus;
      
        //save data
      
      saveData();
      
      /*
      save = new String(highScore + " " + (collectedCoins + totalCoins) + " " + powerups[0] + " " + powerups[1] + " " + powerups[2] + " " + powerups[3]
                        + " " + powerups[4] + " " + amount[1] + " " + amount[2] + " " + amount[3] + " " + amount[4] + " " + amount[5] + " " + using);
      */
    } else {
      
      if (pause == false) p.move();
      p.display();
      
        //pause button
      pushMatrix();
        translate(p.pos.x/10 - width/20, p.pos.y/10 - height/20);
        noStroke();
      
        if (pause == true) {
          if (titleFade <= 60) titleFade++;
          if (titleFade > 40) button(width/2, height/2-165, width-840, height/2-230, "resume");
          if (titleFade > 60) button(width/2, height/2+165, width-840, height/2-230, "menu");
        } else {
          if (mouseX > 25 && mouseX < 83 && mouseY > 15 && mouseY < 80) fill(120, 50);
          else fill(90, 50);
          rect(30, 20, 20, 55, 5);
          rect(58, 20, 20, 55, 5);
        }
      
      popMatrix();
      
    }
    
    //end screen
  } else {
    if (titleFade < 150) titleFade++;
      
    if (titleFade < 90) {
      fill(40, 130);
      rect(-300, -300, width+600, height+600);
    } else background(40);
    
    stroke(55);
    strokeWeight(0.5);
    for (int x = 1; x < width/58; x ++)
      line (x*58, 0, x*58, height);
      
    for (int y = 1; y < height/58 + 1; y++)
      line (0, y*58, width, y*58);
    
    textFont(font);
    textAlign(CENTER, CENTER);
    textSize(140);
    fill(120);
    if (titleFade > 110) text("you are dead", width/2, height/6+160);
    textSize(40);
    if(titleFade > 120) text("score: " + (floor(score/scoreFrac)+bonus), width/2, height/6 + 260);
    
    fill(50);
    rect(width/7*2, height/6, width/7*3, 80);
    if (collectedCoins == finalCollectedCoins && finalCollectedCoins != 0) 
      bonuses.add(new Bonus(new PVector(width/2, height/6), collectedCoins, color(255))); 
    if (collectedCoins > 0) { collectedCoins --; totalCoins ++; }
    fill(120);
    textSize(50);
    text(totalCoins, width/2, height/6 + 40);
    stroke(156, 96, 0, 230);
    strokeWeight(5);
    fill(255, 195, 15, 230);
    ellipse(width/7*5 - 40, height/6+40, 40, 40);
      
    if (titleFade > 140) button(width/2, height/3*2-50, width-840, 120, "play again");
    
    if (titleFade >= 150) button(width/2, height/3*2+90, width-840, 120, "menu");
  }
    
  for (Explosion b : explosions)
      b.move();
    
  for (int i = 0; i < explosions.size(); i++) {
    Explosion b = explosions.get(i);
      
      //removes explosion if time has expired
    if (b.isDead() == true)
      explosions.remove(b);
  }
    
  for (int i = 0; i < bonuses.size(); i++) {
    Bonus b = bonuses.get(i);
    b.display();
    if (b.isDead()) bonuses.remove(b);
  }  
    
    //shop
  if (shopScreen == true) {
    
    background(40);
    
    stroke(55);
    strokeWeight(0.5);
    for (int x = 1; x < width/squareSize; x ++)
      line (x*squareSize, 0, x*squareSize, height);
    for (int y = 1; y < height/squareSize + 1; y++)
      line (0, y*squareSize, width, y*squareSize);
      
    textFont(font);
    textAlign(CENTER, CENTER);
    textSize(100);
    fill(50);
    rect(width/7*2, height/6, width/7*3, 80);
    fill(120);
    textSize(50);
    text(totalCoins, width/2, height/6 + 40);
    stroke(156, 96, 0, 230);
    strokeWeight(5);
    fill(255, 195, 15, 230);
    ellipse(width/7*5 - 40, height/6+40, 40, 40);
    
    pushMatrix();
    translate(width - 100, height/2);
    noStroke();
    if (dist(mouseX, mouseY, width - 100, height/2) < 40) fill(150);
    else fill(120);
    rotate(PI/4);
    rect(-25, -25, 50, 10, 5);
    rotate(PI/2);
    rect(-25, -25, 50, 10, 5);
    popMatrix();
    
    if (upgradeScreen || powerupScreen) {
      pushMatrix();
      translate(100, height/2);
      noStroke();
      if (dist(mouseX, mouseY, 100, height/2) < 40) fill(150);
      else fill(120);
      rotate(-PI/4);
      rect(-25, -25, 50, 10, 5);
      rotate(-PI/2);
      rect(-25, -25, 50, 10, 5);
      popMatrix();
    }
    
    if (upgradeScreen == true) {
      textSize(80);
      fill(120);
      text("upgrades", width/2, 80);
      
      if (purchasedWeapons[upgradeScreenMenu] == false && upgradeScreenMenu < 5) {
        button(width/2, height/2 + 300, 700, 200, ""+(int)sq(upgradeScreenMenu)*500);
        
        stroke(156, 96, 0);
        strokeWeight(8);
        fill(255, 195, 15);
        ellipse(width/2 + 250, height/2 + 300, 50, 50);
      }
      
      if (purchasedWeapons[upgradeScreenMenu] == false && upgradeScreenMenu == 5) {
        if (highScore < 1500) {
          fill(60);
          textSize(50);
          text("???", width/2, height/2 + 300);
          strokeWeight(4);
          noFill();
          stroke(50);
          rect(width/2 - 350, height/2 + 200, 700, 200);
        } else {
          button(width/2, height/2 + 300, 700, 200, "25000");
          
          stroke(156, 96, 0);
          strokeWeight(8);
          fill(255, 195, 15);
          ellipse(width/2 + 250, height/2 + 300, 50, 50);
        }
      }
      
      if (purchasedWeapons[upgradeScreenMenu]) {
        if (using == upgradeScreenMenu) {
          
          fill(80);
          textSize(30);
          text("using", 200, height/2 + 200);
          strokeWeight(4);
          noFill();
          stroke(80);
          rect(50, height/2 + 150, 300, 100);
          
        } else {
          //50 && mouseX < 350 && mouseY > height/2 + 150 && mouseY < height/2 + 250
          button(200, height/2 + 200, 300, 100, "use");
          
        }
      }
      
      if (purchasedWeapons[upgradeScreenMenu] == false && upgradeScreenMenu == 6) {
        if (highScore < 1500) {
          fill(60);
          textSize(50);
          text("???", width/2, height/2 + 300);
          strokeWeight(4);
          noFill();
          stroke(50);
          rect(width/2 - 350, height/2 + 200, 700, 200);
        } else {
          button(width/2, height/2 + 300, 700, 200, "50000");
          
          stroke(156, 96, 0);
          strokeWeight(8);
          fill(255, 195, 15);
          ellipse(width/2 + 250, height/2 + 300, 50, 50);
        }
      }
      
      if (upgradeScreenMenu == 0) {
        
        displayWeapon(new PVector(width/2, height/2), upgradeScreenMenu, 100);
        displayWeapon(new PVector(width/2 + 220, height/2), upgradeScreenMenu + 1, 40);
        
        pushMatrix();
        translate(width/2 + 400, height/2);
        noStroke();
        if (dist(mouseX, mouseY, width/2 + 400, height/2) < 30) fill(150);
        else fill(120);
        rotate(PI/4);
        rect(-15, -15, 30, 6, 3);
        rotate(PI/2);
        rect(-15, -15, 30, 6, 3);
        popMatrix();
        
      }
      
      else if (upgradeScreenMenu == 6) {
        
        displayWeapon(new PVector(width/2, height/2), upgradeScreenMenu, 100);
        displayWeapon(new PVector(width/2 - 220, height/2), upgradeScreenMenu - 1, 40);
        
        pushMatrix();
        translate(width/2 - 400, height/2);
        noStroke();
        if (dist(mouseX, mouseY, 100, height/2) < 30) fill(150);
        else fill(120);
        rotate(-PI/4);
        rect(-15, -15, 30, 6, 3);
        rotate(-PI/2);
        rect(-15, -15, 30, 6, 3);
        popMatrix();
        
      } else {
        
        displayWeapon(new PVector(width/2, height/2), upgradeScreenMenu, 100);
        displayWeapon(new PVector(width/2 - 220, height/2), upgradeScreenMenu - 1, 40);
        displayWeapon(new PVector(width/2 + 220, height/2), upgradeScreenMenu + 1, 40);
        
        pushMatrix();
        translate(width/2 + 400, height/2);
        noStroke();
        if (dist(mouseX, mouseY, width/2 + 400, height/2) < 30) fill(150);
        else fill(120);
        rotate(PI/4);
        rect(-15, -15, 30, 6, 3);
        rotate(PI/2);
        rect(-15, -15, 30, 6, 3);
        popMatrix();
        
        pushMatrix();
        translate(width/2 - 400, height/2);
        noStroke();
        if (dist(mouseX, mouseY, 100, height/2) < 30) fill(150);
        else fill(120);
        rotate(-PI/4);
        rect(-15, -15, 30, 6, 3);
        rotate(-PI/2);
        rect(-15, -15, 30, 6, 3);
        popMatrix();
        
      }
    }
    
    if (powerupScreen == true) {
      textSize(80);
      fill(120);
      text("powerups", width/2, 80);
      
    }
    
    if (skinScreen == true) {
      textSize(80);
      fill(120);
      text("skins", width/2, 80);
    }
  }
  
  mouse();
}
