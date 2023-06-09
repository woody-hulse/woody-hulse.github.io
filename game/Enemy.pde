class Enemy {
  
  PVector vel;
  PVector pos;
  float health;
  float speed;
  float size;
  PVector dir;
  PVector error;
  float rate;
  float damage;
  float shootTimer;
  float maxHealth;
  int value;
  boolean canCombine;
  boolean canHit;
  
  Enemy(PVector pos, float rate, float damage, float health, int value, float speed) {
    this.pos = pos;
    this.rate = rate;
    this.damage = damage;
    vel = new PVector(0, 0);
    this.health = health;
    maxHealth = health;
    this.speed = speed;
    size = p.size - 10 + damage/2;
    shootTimer = rate;
    this.value = value;
    
    error = new PVector(0, 0);
    canCombine = true;
    canHit = true;
  }
  
  void move() {
    
    if (error.x > 0) error.x += random(-0.12, 0.1);
    else error.x += random(-0.1, 0.12);
    if(error.y > 0) error.y += random(-0.12, 0.1);
    else error.y += random(-0.1, 0.12);
    
    dir = new PVector(p.pos.x - pos.x + error.x, p.pos.y - pos.y + error.y);
    dir.normalize();
    
    vel.add(new PVector((p.pos.x - pos.x)/width, (p.pos.y - pos.y)/height).normalize().mult(speed));
    
    vel.mult(.99);
    
    pos.add(new PVector(vel.x*gameSpeed, vel.y*gameSpeed));
    
    if (pos.x > width - size/2) vel.x = vel.x * -0.8 - 2;
    if (pos.x < size/2) vel.x = vel.x * -0.8 + 2;
    if (pos.y > height - size/2) vel.y = vel.y * -0.8 - 2;
    if (pos.y < size/2) vel.y = vel.y * -0.8 + 2;
    
    shootTimer += gameSpeed;
    if (shootTimer > rate) {
      shootTimer = 0;
      bullets.add(new Bullet(new PVector(dir.x*speed*100 + vel.x, dir.y*speed*100 + vel.y), new PVector(pos.x + dir.x*10, pos.y + dir.y*30), size/3, dir, "enemy", damage));
      explosions.add(new Explosion(new PVector(pos.x + dir.x*10, pos.y + dir.y*10), 6, color(168, 72, 50)));
    }
  
  }
  
  void display() {
    pushMatrix();
    translate(pos.x, pos.y);
    
    if (health > 0) {
      noStroke();
      fill(255 - health/maxHealth*255, health/maxHealth*255, 30);
      rect(-15, -2.5 + size*0.9, health/maxHealth*30, 5);
      stroke(60);
      strokeWeight(4);
      noFill();
      rect(-15, -2.5 + size*0.9, 30, 5);
    }
    
    pushMatrix();
    if (dir.x >= 0) rotate(atan(dir.y/dir.x));
    else rotate(atan(dir.y/dir.x) + PI);
    
    noStroke();
    fill(180);
    quad(0, -size*0.4, size * 0.8, -size*0.2, size * 0.8, size*0.2, 0, size*0.4);
    fill(168, 72, 50);
    ellipse(0, 0, size, size);
    popMatrix();
    
    popMatrix();
  }
  
  boolean isDead() {
    if (health <= 0) return true;
    
    return false;
  }

    //checks if enemy has collided with player
  void checkCollision(Player u) {

    PVector distanceVect = PVector.sub(u.pos, pos);

    float distanceVectMag = distanceVect.mag();

    float minDistance = size/2 + u.size/2;
    
    float m = size*0.05;
    float um = u.size*0.05;

    if (distanceVectMag < minDistance) {
      float distanceCorrection = (minDistance-distanceVectMag)/2.0;
      PVector d = distanceVect.copy();
      PVector correctionVector = d.normalize().mult(distanceCorrection);
      u.pos.add(correctionVector);
      pos.sub(correctionVector);

      float theta  = distanceVect.heading();
      float sine = sin(theta);
      float cosine = cos(theta);

      PVector[] bTemp = {
        new PVector(), new PVector()
      };

      bTemp[1].x  = cosine * distanceVect.x + sine * distanceVect.y;
      bTemp[1].y  = cosine * distanceVect.y - sine * distanceVect.x;

      PVector[] vTemp = {
        new PVector(), new PVector()
      };

      vTemp[0].x  = cosine * vel.x + sine * vel.y;
      vTemp[0].y  = cosine * vel.y - sine * vel.x;
      vTemp[1].x  = cosine * u.vel.x + sine * u.vel.y;
      vTemp[1].y  = cosine * u.vel.y - sine * u.vel.x;

      PVector[] vFinal = {  
        new PVector(), new PVector()
      };

      vFinal[0].x = ((m - um) * vTemp[0].x + 2 * um * vTemp[1].x) / (m + um);
      vFinal[0].y = vTemp[0].y;

      vFinal[1].x = ((um - m) * vTemp[1].x + 2 * m * vTemp[0].x) / (m + um);
      vFinal[1].y = vTemp[1].y;

      bTemp[0].x += vFinal[0].x;
      bTemp[1].x += vFinal[1].x;

      PVector[] bFinal = { 
        new PVector(), new PVector()
      };

      bFinal[0].x = cosine * bTemp[0].x - sine * bTemp[0].y;
      bFinal[0].y = cosine * bTemp[0].y + sine * bTemp[0].x;
      bFinal[1].x = cosine * bTemp[1].x - sine * bTemp[1].y;
      bFinal[1].y = cosine * bTemp[1].y + sine * bTemp[1].x;

      u.pos.x = pos.x + bFinal[1].x;
      u.pos.y = pos.y + bFinal[1].y;

      pos.add(bFinal[0]);

      vel.x = cosine * vFinal[0].x - sine * vFinal[0].y;
      vel.y = cosine * vFinal[0].y + sine * vFinal[0].x;
      u.vel.x = cosine * vFinal[1].x - sine * vFinal[1].y;
      u.vel.y = cosine * vFinal[1].y + sine * vFinal[1].x;
      
        //subtracts health from player and enemy
      if (using == 1) health -= 100;
      else health -= 20;
      if (p.boost == false || using != 1) p.health -= 20;
    }
  }
}
