class Player {
  
  PVector vel;
  PVector pos;
  float health;
  float size;
  float charge;
  
  boolean boost;
  float boostTimer;
  
  float pauseTime;
  
  Player(PVector pos) {
    this.pos = pos;
    vel = new PVector(0, 0);
    health = 200;
    
    size = 50;
  }
  
  void keyPressed() {
    if (key == ' ' && charge >= 300) {
      PVector boostDirection = new PVector(mouseX - pos.x, mouseY - pos.y);
      boost = true;
      boostTimer = charge;
      
      vel.mult(0.2);
      vel.add(boostDirection.normalize().mult(charge/6));
      explosions.add(new Explosion(pos, charge/9, color(209, 70, 0)));
      
      charge = 0;
    }
  }
  
  void move() {
    
    if (boostTimer > 0) boostTimer -= gameSpeed;
    else boost = false;
    
    if (mousePressed) vel.add((mouseX - pos.x)/width, (mouseY - pos.y)/height);
    
    if (boost == false) {
      if (charge < 300) charge += gameSpeed;
    }
      pos.add(new PVector(vel.x*gameSpeed, vel.y*gameSpeed));
    
    vel.mult(.99);
    
    if (pos.x > width - size/2) vel.x = vel.x * -0.8 - 2;
    if (pos.x < size/2) vel.x = vel.x * -0.8 + 2;
    if (pos.y > height - size/2) vel.y = vel.y * -0.8 - 2;
    if (pos.y < size/2) vel.y = vel.y * -0.8 + 2;
    
  
  }
  
  void display() {
    
    pushMatrix();
    translate(pos.x, pos.y);
    
    noStroke();
    fill(28, 212, 196);
    ellipse(0, 0, size, size);
    fill(15, 195, 170);
    arc(0, 0, size*0.4, size*0.4, PI/2, PI/2 + charge/300*TWO_PI);
    
    popMatrix();
  }
  
  void slowMo() {
    
    if (boost == true) {
      pauseTime += 0.01;
      
      scale(1 + pauseTime*(1-pauseTime)*0.22);
      gameSpeed = 1 - pauseTime*(1-pauseTime)*3.6;
      //translate((width/2 - pos.x)*(sin(pauseTime*TWO_PI)/10), (height/2 - pos.y)*(sin(pauseTime*TWO_PI)/10));
      
      if (pauseTime >= 1) {
        pauseTime = 0;
        boost = false;
      }
    }
  }
  
  boolean isDead() {
    if (health <= 0) return true;
    
    else return false;
  }
}
