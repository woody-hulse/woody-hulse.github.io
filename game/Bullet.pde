class Bullet {
  
  PVector vel;
  PVector pos;
  float size;
    //which object shot the bullet ("player" or "enemy" usually)
  String origin;
    //direction of bullet
  PVector dir;
    //damage bullet can do
  float damage;
  
  Bullet (PVector vel, PVector pos, float size, PVector dir, String origin, float damage) {
    this.vel = vel;
    this.pos = pos;
    this.size = size + bulletDamage/10;
    this.origin = origin;
    this.dir = dir.normalize();
    this.damage = damage + bulletDamage;
    
    if (powerupDuration[2] > 0) vel.mult(1.5);
  }
  
  void move () {
    
    vel.mult(0.9999);
    
    pos.add(new PVector(vel.x, vel.y));
    
  }
  
  void display() {
    
    pushMatrix();
    translate(pos.x, pos.y);
    
    if (dir.x >= 0) rotate(atan(dir.y/dir.x));
    else rotate(atan(dir.y/dir.x) + PI);
   
    noStroke();
    if (origin.equals("player")) {
      if (powerupDuration[2] > 0) fill(255, 140, 0);
      else fill (playerColor);
      rect(-size/2, -size/2, size, size);
      if (powerupDuration[2] > 0) fill(240, 130, 0, 100);
      else fill (14, 106, 98, 100);
      triangle(size/2, size/2, size/2, -size/2, -dist(vel.x, vel.y, 0, 0) * 5, 0);
    }
    else if (origin.equals("enemy")) {
      fill (84, 36, 25, 100);
      triangle(0, size/2, 0, -size/2, -dist(vel.x, vel.y, 0, 0) * 5, 0);
      fill (enemyColor, 200);
      ellipse(0, 0, size, size);
    } else fill(115, 210);
    
    popMatrix();
    
    
  }
  
    //checks if bullet has hit an object
  boolean hit() {
    
    if (origin.equals("player")) {
      
      for (Enemy e : enemies) {
        if (dist(pos.x, pos.y, e.pos.x, e.pos.y) < e.size/2 + size/2 + 4) {
          e.health -= damage;
          explosions.add(new Explosion(new PVector(pos.x, pos.y), damage/2, playerColor));
          return true;
        }
      }
      
    } else if (origin.equals("enemy")) {
      if (dist(pos.x, pos.y, p.pos.x, p.pos.y) < p.size/2 + size/2 + 4) {
        
        if (powerupDuration[5] > 0) {
          powerupDuration[5] -= damage*3;
          explosions.add(new Explosion(new PVector(pos.x, pos.y), damage/2, color(20, 147, 201)));
        } else {
          p.health -= damage;
          explosions.add(new Explosion(new PVector(pos.x, pos.y), damage, enemyColor));
        }
        
        return true;
      }
    }
    
    if (pos.x > width || pos.x < 0 || pos.y > height || pos.y < 0) {
      explosions.add(new Explosion(pos, p.size/5, color(255, 150)));
      return true;
    }
    
    return false;
  }
}
