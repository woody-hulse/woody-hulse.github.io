class Boss1 extends Enemy {
  
  int phase = 1;
  float rotation;
  int timer;
  
  Boss1(PVector pos, float rate, float damage, float health, int value, float speed) {
    super(pos, rate, damage, health, value, speed);
    size = p.size*3 + damage/2;
    rotation = 0;
    timer = 0;
    canCombine = false;
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
    
    if (phase == 1) {
    
        shootTimer += gameSpeed;
      if (shootTimer > rate) {
        shootTimer = 0;
        enemies.add(new Enemy(new PVector(pos.x + dir.x*size, pos.y + dir.y*size), 80, 10, 60, 1, 0.07));
        explosions.add(new Explosion(new PVector(pos.x + dir.x*size, pos.y + dir.y*size), 30, color(255)));
      }
      
      if (health < 800) phase = 2;
      
    } else {
    
      if (rotation < PI*6) {
        rotation += 2/(rotation + 1);
      }
      
      shootTimer++;
      if (shootTimer > rate) {
        shootTimer = 0;
        bullets.add(new Bullet(new PVector(dir.x*speed*100 + vel.x, dir.y*speed*100 + vel.y).mult(2), new PVector(pos.x + dir.x*size, pos.y + dir.y*size), size/3, dir, "enemy", damage));
        bullets.add(new Bullet(new PVector(-dir.x*speed*100 - vel.x, dir.y*speed*100 + vel.y).mult(2), new PVector(pos.x - dir.x*size, pos.y + dir.y*size), size/3, dir, "enemy", damage));
        bullets.add(new Bullet(new PVector(dir.x*speed*100 + vel.x, -dir.y*speed*100 - vel.y).mult(2), new PVector(pos.x + dir.x*size, pos.y - dir.y*size), size/3, dir, "enemy", damage));
        bullets.add(new Bullet(new PVector(-dir.x*speed*100 - vel.x, -dir.y*speed*100 - vel.y).mult(2), new PVector(pos.x - dir.x*size, pos.y - dir.y*size), size/3, dir, "enemy", damage));
        
        explosions.add(new Explosion(new PVector(pos.x + dir.x*size, pos.y + dir.y*size), 20, color(168, 72, 50)));
        explosions.add(new Explosion(new PVector(pos.x - dir.x*size, pos.y + dir.y*size), 20, color(168, 72, 50)));
        explosions.add(new Explosion(new PVector(pos.x + dir.x*size, pos.y - dir.y*size), 20, color(168, 72, 50)));
        explosions.add(new Explosion(new PVector(pos.x - dir.x*size, pos.y - dir.y*size), 20, color(168, 72, 50)));
      }
    }
  
  }
  
  void display() {
    pushMatrix();
      translate(pos.x, pos.y);
      
      if (dir.x >= 0) rotate(atan(dir.y/dir.x) + rotation);
      else rotate(atan(dir.y/dir.x) + PI + rotation);
      
      noStroke();
      fill(180);
      if (phase == 1) quad(0, -size*0.4, size * 0.8, -size*0.2, size * 0.8, size*0.2, 0, size*0.4);
      else {
        rect(-size/4, size/2, size/2, size/8);
        rect(-size/4, -size/2, size/2, -size/8);
        rect(size/2, -size/4, size/8, size/2);
        rect(-size/2, -size/4, -size/8, size/2);
      }
      fill(168, 72, 50);
      ellipse(0, 0, size, size);
    
      fill(enemyColor);
      rect(-size/2, -size/2, size, size, 3);
    popMatrix();
    
    if (health > 0) {
      noStroke();
      fill(255 - health/maxHealth*255, health/maxHealth*255, 30);
      rect(pos.x-30, pos.y-5 + size*0.9, health/maxHealth*60, 10);
      stroke(60);
      strokeWeight(8);
      noFill();
      rect(pos.x-30, pos.y-5 + size*0.9, 60, 10);
    }
  }
}
